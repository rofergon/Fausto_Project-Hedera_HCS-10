import * as dotenv from 'dotenv';
import { initializeHCS10Client } from '../src/index';
import { HCS10Client, ExtendedAgentMetadata } from '../src/hcs10/HCS10Client';
import { ConnectionTool } from '../src/tools/ConnectionTool';
import { ConnectionMonitorTool } from '../src/tools/ConnectionMonitorTool';
import { ListConnectionsTool } from '../src/tools/ListConnectionsTool';
import { InitiateConnectionTool } from '../src/tools/InitiateConnectionTool';
import { SendMessageToConnectionTool } from '../src/tools/SendMessageToConnectionTool';
import { CheckMessagesTool } from '../src/tools/CheckMessagesTool';
import { ManageConnectionRequestsTool } from '../src/tools/ManageConnectionRequestsTool';
import { AcceptConnectionRequestTool } from '../src/tools/AcceptConnectionRequestTool';
import { OpenConvaiState } from '../src/state/open-convai-state';
import readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { updateEnvFile } from './utils';
import { ENV_FILE_PATH } from './utils';
import { AIAgentCapability } from '@hashgraphonline/standards-sdk';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// --- Interfaces & State ---
interface RegisteredAgent {
  name: string;
  accountId: string;
  inboundTopicId: string;
  outboundTopicId: string;
  profileTopicId?: string;
  operatorPrivateKey: string;
}

interface ActiveConnection {
  targetAccountId: string;
  targetAgentName: string; // Store target agent name for display
  targetInboundTopicId: string;
  connectionTopicId: string;
}

let hcsClient: HCS10Client;
let connectionTool: ConnectionTool; // For backward compatibility
let connectionMonitorTool: ConnectionMonitorTool; // Our new tool
let currentAgent: RegisteredAgent | null = null;
const registeredAgents: RegisteredAgent[] = [];
let stateManager: OpenConvaiState;
let isMonitoring = false; // Track monitoring status explicitly

// --- Readline Setup ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

// --- Helper Functions ---
function displayHeader(title: string) {
  console.log(`\n--- ${title} ---`);
}

function displayAgentInfo(agent: RegisteredAgent | null) {
  if (agent) {
    console.log(`  Name: ${agent.name}`);
    console.log(`  Account ID: ${agent.accountId}`);
    console.log(`  Inbound Topic: ${agent.inboundTopicId}`);
    console.log(`  Outbound Topic: ${agent.outboundTopicId}`);
    if (agent.profileTopicId) {
      console.log(`  Profile Topic: ${agent.profileTopicId}`);
    }
  } else {
    console.log('  No agent details available.');
  }
}

// Helper function to display available capabilities
function displayCapabilities() {
  displayHeader('Available Agent Capabilities');
  console.log('  0: TEXT_GENERATION - Generate coherent, human-like text');
  console.log('  1: IMAGE_GENERATION - Create visual content based on prompts');
  console.log(
    '  2: AUDIO_GENERATION - Synthesize speech, music, or soundscapes'
  );
  console.log('  3: VIDEO_GENERATION - Produce dynamic visual content');
  console.log('  4: CODE_GENERATION - Produce code based on text prompts');
  console.log('  5: LANGUAGE_TRANSLATION - Convert text between languages');
  console.log(
    '  6: SUMMARIZATION_EXTRACTION - Distill content into concise summaries'
  );
  console.log(
    '  7: KNOWLEDGE_RETRIEVAL - Access and reason with structured data'
  );
  console.log('  8: DATA_INTEGRATION - Aggregate and visualize data sources');
  console.log('  9: MARKET_INTELLIGENCE - Analyze financial and economic data');
  console.log(' 10: TRANSACTION_ANALYTICS - Monitor and analyze transactions');
  console.log(' 11: SMART_CONTRACT_AUDIT - Evaluate decentralized code');
  console.log(
    ' 12: GOVERNANCE_FACILITATION - Support decentralized decision-making'
  );
  console.log(
    ' 13: SECURITY_MONITORING - Detect and respond to security threats'
  );
  console.log(' 14: COMPLIANCE_ANALYSIS - Ensure regulatory adherence');
  console.log(
    ' 15: FRAUD_DETECTION - Identify and mitigate fraudulent activities'
  );
  console.log(
    ' 16: MULTI_AGENT_COORDINATION - Enable collaboration between agents'
  );
  console.log(
    ' 17: API_INTEGRATION - Connect with external systems and services'
  );
  console.log(
    ' 18: WORKFLOW_AUTOMATION - Automate routine tasks and processes'
  );
}

// --- Agent Actions ---
async function registerNewAgent() {
  displayHeader('Register New Agent');
  const name = await question('Enter agent name: ');
  const description = await question('Enter agent description (optional): ');
  const model = await question(
    'Enter agent model identifier (optional, e.g., gpt-4o): '
  );

  // Display capabilities and let user select
  displayCapabilities();
  console.log(
    '\nSelect capabilities (comma-separated numbers, e.g., "0,4,7"): '
  );
  const capabilitiesInput = await question('> ');

  let capabilities: number[] = [AIAgentCapability.TEXT_GENERATION]; // Default

  if (capabilitiesInput.trim()) {
    try {
      capabilities = capabilitiesInput.split(',').map((num) => {
        const parsed = parseInt(num.trim(), 10);
        if (isNaN(parsed) || parsed < 0 || parsed > 18) {
          throw new Error(`Invalid capability number: ${num.trim()}`);
        }
        return parsed;
      });

      if (capabilities.length === 0) {
        console.log(
          'No valid capabilities selected, defaulting to TEXT_GENERATION only.'
        );
        capabilities = [AIAgentCapability.TEXT_GENERATION];
      }
    } catch (error) {
      console.error(
        `Error parsing capabilities: ${
          error instanceof Error ? error.message : error
        }`
      );
      console.log('Defaulting to TEXT_GENERATION capability only.');
      capabilities = [AIAgentCapability.TEXT_GENERATION];
    }
  }

  console.log(`Selected capabilities: ${capabilities.join(', ')}`);

  const pfpPath = await question(
    'Enter the path to the profile picture file (relative to project root, e.g., logo.png): '
  );

  if (!name) {
    console.error('Agent name is required.');
    return;
  }

  let pfpFileName: string | undefined = undefined;
  let pfpBuffer: Buffer | undefined = undefined;

  if (pfpPath) {
    // Construct path relative to project root
    const pfpLocation = path.join(projectRoot, pfpPath);
    console.log(`Attempting to read profile picture from: ${pfpLocation}`);

    try {
      if (!fs.existsSync(pfpLocation)) {
        throw new Error(`File not found at path: ${pfpLocation}`);
      }

      pfpBuffer = fs.readFileSync(pfpLocation);
      pfpFileName = path.basename(pfpPath);
      console.log(
        `Read profile picture ${pfpFileName} (${pfpBuffer?.length} bytes).`
      );

      if (pfpBuffer?.length === 0) {
        console.warn('Warning: The selected profile picture file is empty.');
      }
    } catch (fileError) {
      console.error(
        `Error reading profile picture file: ${
          fileError instanceof Error ? fileError.message : fileError
        }`
      );
      console.log(
        'Proceeding without a profile picture. Agent registration might fail.'
      );
      pfpBuffer = undefined;
      pfpFileName = undefined;
    }
  } else {
    console.log(
      'No profile picture path provided. Agent registration might fail if required.'
    );
  }

  // Use the extended metadata type
  const metadata: ExtendedAgentMetadata = {
    name,
    description,
    model,
    type: 'autonomous', // Defaulting to autonomous
    capabilities, // Add the selected capabilities
    pfpBuffer, // Add the buffer
    pfpFileName, // Add the filename
  };

  try {
    console.log(
      `\nRegistering agent "${name}"... this may take several minutes.`
    );
    // Pass the metadata object which now includes PFP details (or undefined)
    const result = await hcsClient.createAndRegisterAgent(metadata);

    if (
      !result?.metadata?.accountId ||
      !result?.metadata?.inboundTopicId ||
      !result?.metadata?.outboundTopicId
    ) {
      console.error('Registration failed. Result metadata incomplete:', result);
      return;
    }

    const newAgent: RegisteredAgent = {
      name: name,
      accountId: result.metadata.accountId,
      inboundTopicId: result.metadata.inboundTopicId,
      outboundTopicId: result.metadata.outboundTopicId,
      profileTopicId: result.metadata.profileTopicId,
      operatorPrivateKey: result.metadata.privateKey,
    };

    await updateEnvFile(ENV_FILE_PATH, {
      TODD_ACCOUNT_ID: result?.metadata?.accountId,
      TODD_PRIVATE_KEY: result?.metadata?.privateKey,
      TODD_INBOUND_TOPIC_ID: result?.metadata?.inboundTopicId,
      TODD_OUTBOUND_TOPIC_ID: result?.metadata?.outboundTopicId,
    });

    registeredAgents.push(newAgent);
    console.log('\nRegistration Successful!');
    displayAgentInfo(newAgent);

    // Automatically select the newly registered agent
    if (registeredAgents.length === 1) {
      currentAgent = newAgent;
      hcsClient = new HCS10Client(
        newAgent.accountId,
        newAgent.operatorPrivateKey,
        hcsClient.getNetwork(),
        {
          useEncryption: false,
          registryUrl: process.env.REGISTRY_URL || 'https://moonscape.tech',
        }
      );
      console.log(
        `\nAgent "${currentAgent.name}" automatically selected as active agent.`
      );
    }

    // Recreate the connection tool with the agent's client
    connectionTool = new ConnectionTool({
      client: hcsClient,
      stateManager: stateManager,
    });
    console.log('Connection tool reconfigured for active agent');

    // Update the state manager with the current agent
    stateManager.setCurrentAgent(currentAgent);
  } catch (error) {
    console.error('\nError registering agent:', error);
  }
}

async function listManagedAgents() {
  displayHeader('Managed Agents (This Session)');
  if (registeredAgents.length === 0) {
    console.log('No agents have been registered in this session.');
    return;
  }
  registeredAgents.forEach((agent, index) => {
    console.log(
      `${index + 1}. ${agent.name} (${agent.accountId}) ${
        agent === currentAgent ? '[ACTIVE]' : ''
      }`
    );
  });
}

async function selectActiveAgent() {
  displayHeader('Select Active Agent');
  if (registeredAgents.length === 0) {
    console.log('No agents available to select. Register an agent first.');
    return;
  }

  await listManagedAgents();
  const choice = await question('Enter the number of the agent to activate: ');
  const index = parseInt(choice) - 1;

  if (isNaN(index) || index < 0 || index >= registeredAgents.length) {
    console.log('Invalid choice.');
    return;
  }

  currentAgent = registeredAgents[index];
  console.log(`Agent "${currentAgent.name}" selected as active.`);

  // Stop monitoring if active for the previous agent
  if (isMonitoring) {
    console.log('Stopping connection monitoring for the previous agent...');
    connectionTool.stopMonitoring();
    isMonitoring = false;
  }

  // Reconfigure client for the selected agent
  hcsClient = new HCS10Client(
    currentAgent.accountId,
    currentAgent.operatorPrivateKey,
    hcsClient.getNetwork(),
    {
      useEncryption: false,
      registryUrl: process.env.REGISTRY_URL || 'https://moonscape.tech',
    }
  );
  console.log(`Client reconfigured for active agent: ${currentAgent.name}`);

  // Reset active connections when switching agents
  stateManager.setCurrentAgent(currentAgent);
  console.log('Active connections cleared for the new agent.');
}

// --- Connection Actions ---
async function startMonitoringConnections() {
  displayHeader('Monitor Incoming Connections');
  if (!currentAgent) {
    console.log(
      'No active agent selected. Please select or register an agent first.'
    );
    return;
  }
  if (!currentAgent.inboundTopicId) {
    console.log('Active agent data is missing the inbound topic ID.');
    return;
  }
  if (isMonitoring) {
    console.log(
      `Already monitoring connections for ${currentAgent.name} on topic ${currentAgent.inboundTopicId}.`
    );
    return;
  }

  try {
    // Use the ConnectionMonitorTool to start monitoring
    const result = await connectionMonitorTool.call({
      acceptAll: true,
      monitorDurationSeconds: 60,
    });
    console.log(result);
    if (
      result.includes('Monitored for') ||
      result.includes('Started monitoring')
    ) {
      isMonitoring = true;
    }
  } catch (error) {
    console.error('\nError starting connection monitor:', error);
  }
}

async function stopMonitoringConnections() {
  displayHeader('Stop Monitoring Connections');
  if (!isMonitoring) {
    console.log('Connection monitoring is not currently active.');
    return;
  }
  if (!currentAgent) {
    console.log(
      'Warning: No active agent, but monitoring was somehow active. Attempting to stop.'
    );
  }

  try {
    // For backward compatibility, still stop the connectionTool if it's running
    if (connectionTool) {
      connectionTool.stopMonitoring();
    }
    isMonitoring = false;
    console.log('Connection monitoring stopped.');
  } catch (error) {
    console.error('\nError stopping connection monitor:', error);
  }
}

async function initiateConnection() {
  displayHeader('Initiate Connection');
  if (!currentAgent) {
    console.log(
      'No active agent selected. Please select or register an agent first.'
    );
    return;
  }

  const targetAccountId = await question(
    "Enter the target agent's Account ID (e.g., 0.0.12345): "
  );
  if (!targetAccountId || !/^\d+\.\d+\.\d+$/.test(targetAccountId)) {
    console.log('Invalid Account ID format.');
    return;
  }

  if (targetAccountId === currentAgent.accountId) {
    console.log('Cannot connect to yourself.');
    return;
  }

  if (
    stateManager
      .listConnections()
      .some(
        (c) =>
          c.targetAccountId === targetAccountId &&
          !c.isPending &&
          !c.needsConfirmation
      )
  ) {
    console.log(
      `Already have an established connection with ${targetAccountId}.`
    );
    return;
  }

  try {
    console.log(`Initiating connection to ${targetAccountId}...`);

    const initiateConnectionTool = new InitiateConnectionTool({
      hcsClient,
      stateManager,
    });

    const configureFees = await question(
      'Configure fees for this connection? (y/n): '
    );

    if (configureFees.toLowerCase() === 'y') {
      console.log(
        'Note: Fee configuration is not supported by the InitiateConnectionTool in this implementation.'
      );
      const result = await initiateConnectionTool.call({ targetAccountId });
      console.log(result);
    } else {
      const result = await initiateConnectionTool.call({ targetAccountId });
      console.log(result);
    }
  } catch (error) {
    console.error(
      '\nUnexpected error during connection initiation:',
      error instanceof Error ? error.message : error
    );
  }
}

async function listActiveConnections() {
  displayHeader('Active Connections');
  if (!currentAgent) {
    console.log('No active agent selected.');
    return;
  }

  try {
    console.log(
      `Fetching connections for ${currentAgent.name} (${currentAgent.accountId})...`
    );

    if (!stateManager) {
      console.error('State manager is not initialized!');
      return;
    }

    // Create the ListConnectionsTool on demand with current hcsClient
    const listTool = new ListConnectionsTool({ stateManager, hcsClient });

    const connectionListOutput = await listTool.call({
      includeDetails: true,
      showPending: true,
    });

    console.log(connectionListOutput);
  } catch (error) {
    console.error(
      '\\nError listing connections using ListConnectionsTool:',
      error
    );
  }
}

async function manageConnectionRequests() {
  displayHeader('Manage Connection Requests');
  if (!currentAgent) {
    console.log('No active agent selected.');
    return;
  }

  const manageTool = new ManageConnectionRequestsTool({
    hcsClient,
    stateManager,
  });

  const acceptTool = new AcceptConnectionRequestTool({
    hcsClient,
    stateManager,
  });

  console.log('Connection Request Management Options:');
  console.log('  1. List Pending Requests');
  console.log('  2. View Request Details');
  console.log('  3. Accept Request');
  console.log('  4. Reject Request');
  console.log('  0. Back to Main Menu');

  const choice = await question('Enter your choice: ');

  // Variables needed for request management
  let viewRequestId,
    acceptRequestId,
    rejectRequestId,
    reqId,
    configureFees,
    hbarFeeStr,
    exemptAccountsInput;
  let hbarFee, exemptIds;

  switch (choice.trim()) {
    case '1':
      try {
        const result = await manageTool.call({ action: 'list' });
        console.log(result);
      } catch (error) {
        console.error('\nError listing requests:', error);
      }
      break;

    case '2':
      viewRequestId = await question('Enter request ID to view: ');
      try {
        reqId = parseInt(viewRequestId.trim());
        if (isNaN(reqId)) {
          console.log('Invalid request ID format.');
          break;
        }
        const result = await manageTool.call({
          action: 'view',
          requestId: reqId,
        });
        console.log(result);
      } catch (error) {
        console.error('\nError viewing request:', error);
      }
      break;

    case '3':
      acceptRequestId = await question('Enter request ID to accept: ');
      try {
        reqId = parseInt(acceptRequestId.trim());
        if (isNaN(reqId)) {
          console.log('Invalid request ID format.');
          break;
        }

        configureFees = await question(
          'Configure fees for this connection? (y/n): '
        );

        if (configureFees.toLowerCase() === 'y') {
          hbarFeeStr = await question('HBAR fee amount (e.g., 0.5): ');
          exemptAccountsInput = await question(
            'Exempt account IDs (comma-separated, leave blank for none): '
          );

          if (hbarFeeStr.trim()) {
            hbarFee = parseFloat(hbarFeeStr);
            if (isNaN(hbarFee) || hbarFee < 0) {
              console.log('Invalid HBAR fee amount. Fee will not be set.');
              hbarFee = undefined;
            }
          }

          if (exemptAccountsInput.trim()) {
            exemptIds = exemptAccountsInput
              .split(',')
              .map((id) => id.trim())
              .filter((id) => /^\d+\.\d+\.\d+$/.test(id));
            if (exemptIds.length === 0) {
              console.log('No valid exempt account IDs provided.');
              exemptIds = undefined;
            }
          }

          const result = await acceptTool.call({
            requestId: reqId,
            hbarFee,
            exemptAccountIds: exemptIds,
          });
          console.log(result);
        } else {
          const result = await acceptTool.call({
            requestId: reqId,
          });
          console.log(result);
        }
      } catch (error) {
        console.error('\nError accepting request:', error);
      }
      break;

    case '4':
      rejectRequestId = await question('Enter request ID to reject: ');
      try {
        reqId = parseInt(rejectRequestId.trim());
        if (isNaN(reqId)) {
          console.log('Invalid request ID format.');
          break;
        }
        const result = await manageTool.call({
          action: 'reject',
          requestId: reqId,
        });
        console.log(result);
      } catch (error) {
        console.error('\nError rejecting request:', error);
      }
      break;

    case '0':
      return;

    default:
      console.log('Invalid choice.');
      break;
  }

  await manageConnectionRequests();
}

// --- Messaging Actions ---
async function selectConnection(
  promptMessage: string
): Promise<ActiveConnection | null> {
  // Instead of directly using stateManager.listConnections(), which might not be in sync,
  // we'll use the listConnectionsTool to ensure we have the most up-to-date connections
  if (!currentAgent) {
    console.log('No active agent selected.');
    return null;
  }

  // First refresh connections using the same tool as option 7
  try {
    // Create the ListConnectionsTool on demand with current hcsClient
    const listTool = new ListConnectionsTool({ stateManager, hcsClient });
    await listTool.call({
      includeDetails: false,
      showPending: true,
    });
  } catch (error) {
    console.error('Error refreshing connections:', error);
    // Continue with what we have in state, even if refresh failed
  }

  // Now get the updated list from state manager
  const currentConnections = stateManager.listConnections();
  console.log(
    `Found ${currentConnections.length} connections in state manager.`
  );

  if (currentConnections.length === 0) {
    console.log('No active connections available.');
    return null;
  }
  displayHeader('Select Connection');
  console.log(
    `Connections for ${currentAgent?.name} (${currentAgent?.accountId}):`
  );
  // Log all connections for debugging
  currentConnections.forEach((conn, index) => {
    console.log(
      `${index + 1}. To: ${conn.targetAgentName} (${conn.targetAccountId})`
    );
    console.log(`     Connection Topic: ${conn.connectionTopicId}`);
    // Determine status in a more readable way without nested ternary
    let statusDisplay = conn.status || 'unknown';
    if (conn.isPending) {
      statusDisplay = 'pending';
    } else if (conn.needsConfirmation) {
      statusDisplay = 'needs confirmation';
    } else if (!statusDisplay || statusDisplay === 'unknown') {
      statusDisplay = 'established';
    }
    console.log(`     Status: ${statusDisplay}`);
  });

  const choice = await question(promptMessage);
  const index = parseInt(choice) - 1;

  if (isNaN(index) || index < 0 || index >= currentConnections.length) {
    console.log('Invalid choice.');
    return null;
  }
  return currentConnections[index];
}

async function sendMessageToConnection() {
  displayHeader('Send Message');
  if (!currentAgent) {
    console.log('No active agent selected.');
    return;
  }
  const connection = await selectConnection(
    'Select connection to send message to: '
  );
  if (!connection) {
    console.log('Invalid connection selection.');
    return;
  }

  const messageContent = await question('Enter message content: ');
  if (!messageContent) {
    console.log('Message cannot be empty.');
    return;
  }

  try {
    console.log(`Sending message to ${connection.targetAgentName}...`);
    const sendMessageToConnectionTool = new SendMessageToConnectionTool({
      hcsClient,
      stateManager,
    });
    const result = await sendMessageToConnectionTool.call({
      targetIdentifier: connection.targetAccountId,
      message: messageContent,
    });

    console.log(result);
  } catch (error) {
    console.error(
      '\nUnexpected error sending message:',
      error instanceof Error ? error.message : error
    );
  }
}

async function viewMessagesFromConnection() {
  displayHeader('View Incoming Messages');
  if (!currentAgent) {
    console.log('No active agent selected.');
    return;
  }
  const connection = await selectConnection(
    'Select connection to view messages from: '
  );
  if (!connection) {
    console.log('Invalid connection selection.');
    return;
  }

  try {
    console.log(`Checking for messages from ${connection.targetAgentName}...`);
    const checkMessagesTool = new CheckMessagesTool({
      hcsClient,
      stateManager,
    });
    const result = await checkMessagesTool.call({
      targetIdentifier: connection.targetAccountId,
      lastMessagesCount: 10,
    });

    console.log(result);
  } catch (error) {
    console.error(
      '\nUnexpected error checking messages:',
      error instanceof Error ? error.message : error
    );
  }
}

// --- Main Menu Loop ---
async function showMenu() {
  console.log('\n============ HCS-10 CLI Demo ============');
  console.log(
    `Active Agent: ${
      currentAgent
        ? `${currentAgent.name} (${currentAgent.accountId})`
        : 'None Selected'
    }`
  );
  console.log(`Monitoring Status: ${isMonitoring ? 'ACTIVE' : 'INACTIVE'}`);
  console.log('-----------------------------------------');
  console.log('Agent Management:');
  console.log('  1. Register New Agent');
  console.log('  2. List Managed Agents (This Session)');
  console.log('  3. Select Active Agent');
  console.log('-----------------------------------------');
  console.log('Connection Management:');
  console.log('  4. Start Monitoring Incoming Connections (for Active Agent)');
  console.log('  5. Stop Monitoring Incoming Connections');
  console.log('  6. Initiate Connection to Another Agent');
  console.log('  7. List Active Connections (for Active Agent)');
  console.log('  10. Manage Connection Requests');
  console.log('  11. Accept Connection Request (Direct)');
  console.log('-----------------------------------------');
  console.log('Messaging:');
  console.log('  8. Send Message to Active Connection');
  console.log('  9. View Incoming Messages from Active Connection');
  console.log('-----------------------------------------');
  console.log('  0. Exit');
  console.log('=========================================');

  const choice = await question('Enter your choice: ');

  switch (choice.trim()) {
    case '1':
      await registerNewAgent();
      break;
    case '2':
      await listManagedAgents();
      break;
    case '3':
      await selectActiveAgent();
      break;
    case '4':
      await startMonitoringConnections();
      break;
    case '5':
      await stopMonitoringConnections();
      break;
    case '6':
      await initiateConnection();
      break;
    case '7':
      await listActiveConnections();
      break;
    case '8':
      await sendMessageToConnection();
      break;
    case '9':
      await viewMessagesFromConnection();
      break;
    case '10':
      await manageConnectionRequests();
      break;
    case '11':
      await acceptConnectionRequest();
      break;
    case '0':
      console.log('Exiting demo...');
      if (isMonitoring) {
        console.log('Stopping connection monitoring...');
        connectionTool.stopMonitoring();
        isMonitoring = false;
      }
      rl.close();
      return; // Stop loop
    default:
      console.log('Invalid choice. Please try again.');
      break;
  }
  // Show menu again unless exiting
  await showMenu();
}

// --- Initialization and Start ---
async function main() {
  console.log('Initializing HCS10 client...');
  try {
    stateManager = new OpenConvaiState();
    const initResult = await initializeHCS10Client({
      useEncryption: false, // Keep encryption off for simplicity in demo
      registryUrl: process.env.REGISTRY_URL || 'https://moonscape.tech',
      stateManager: stateManager,
    });
    hcsClient = initResult.hcs10Client;
    connectionTool = initResult.tools.connectionTool;

    // Initialize our ConnectionMonitorTool with the client
    connectionMonitorTool = new ConnectionMonitorTool({
      hcsClient: hcsClient,
      stateManager: stateManager,
    });

    console.log('Client initialized successfully.');

    const toddAccountId = process.env.TODD_ACCOUNT_ID;
    const toddPrivateKey = process.env.TODD_PRIVATE_KEY;
    const toddInboundTopicId = process.env.TODD_INBOUND_TOPIC_ID;
    const toddOutboundTopicId = process.env.TODD_OUTBOUND_TOPIC_ID;
    const toddProfileTopicId = process.env.TODD_PROFILE_TOPIC_ID; // Optional

    if (
      toddAccountId &&
      toddPrivateKey &&
      toddInboundTopicId &&
      toddOutboundTopicId
    ) {
      console.log(
        'Found Todd agent details in environment variables. Setting as active agent...'
      );
      const toddAgent: RegisteredAgent = {
        name: 'Todd (from env)',
        accountId: toddAccountId,
        inboundTopicId: toddInboundTopicId,
        outboundTopicId: toddOutboundTopicId,
        profileTopicId: toddProfileTopicId,
        operatorPrivateKey: toddPrivateKey,
      };

      registeredAgents.push(toddAgent);
      currentAgent = toddAgent;

      hcsClient = new HCS10Client(
        currentAgent.accountId,
        currentAgent.operatorPrivateKey,
        hcsClient.getNetwork(),
        {
          useEncryption: false,
          registryUrl: process.env.REGISTRY_URL || 'https://moonscape.tech',
        }
      );
      console.log(`Client reconfigured for active agent: ${currentAgent.name}`);

      // Recreate the connection tool with the agent's client
      connectionTool = new ConnectionTool({
        client: hcsClient,
        stateManager: stateManager,
      });

      // Update our ConnectionMonitorTool with the new client
      connectionMonitorTool.updateClient(hcsClient);

      console.log('Connection tools reconfigured for active agent');

      // Update the state manager with the current agent
      stateManager.setCurrentAgent(currentAgent);
    } else {
      console.log(
        'Todd agent details not found in environment variables. Register or select an agent manually.'
      );
    }

    await showMenu();
  } catch (error) {
    console.error('Failed to initialize HCS10 client:', error);
    rl.close();
  }
}

async function acceptConnectionRequest() {
  displayHeader('Accept Connection Request');
  if (!currentAgent) {
    console.log('No active agent selected.');
    return;
  }

  const manageTool = new ManageConnectionRequestsTool({
    hcsClient,
    stateManager,
  });

  const acceptTool = new AcceptConnectionRequestTool({
    hcsClient,
    stateManager,
  });

  try {
    console.log('Current pending requests:');
    const listResult = await manageTool.call({ action: 'list' });
    console.log(listResult);

    if (listResult.includes('No pending connection requests found')) {
      console.log('No requests to accept.');
      return;
    }

    const requestId = await question('Enter request ID to accept: ');
    const reqId = parseInt(requestId.trim());
    if (isNaN(reqId)) {
      console.log('Invalid request ID format.');
      return;
    }

    const feeParams: any = { requestId: reqId };
    const configureFees = await question(
      'Configure fees for this connection? (y/n): '
    );

    if (configureFees.toLowerCase() === 'y') {
      const hbarFees = [];
      const tokenFees = [];
      let defaultCollectorAccount = '';

      // Configure default collector account (optional)
      const configureDefaultCollector = await question(
        'Configure default collector account? (y/n): '
      );
      if (configureDefaultCollector.toLowerCase() === 'y') {
        defaultCollectorAccount = await question(
          'Default collector account ID (leave blank for agent account): '
        );
        if (defaultCollectorAccount.trim()) {
          feeParams.defaultCollectorAccount = defaultCollectorAccount.trim();
        }
      }

      // Configure HBAR fees (can have multiple)
      const configureHbarFees = await question('Configure HBAR fees? (y/n): ');
      if (configureHbarFees.toLowerCase() === 'y') {
        let addMore = true;

        while (addMore) {
          const hbarFeeStr = await question('HBAR fee amount: ');
          if (hbarFeeStr.trim()) {
            const amount = parseFloat(hbarFeeStr);
            if (isNaN(amount) || amount <= 0) {
              console.log('Invalid HBAR fee amount. Fee will not be added.');
            } else {
              const fee: any = { amount };

              const collectorAccount = await question(
                'Collector account ID (leave blank for default): '
              );
              if (collectorAccount.trim()) {
                fee.collectorAccount = collectorAccount.trim();
              }

              hbarFees.push(fee);
              console.log(
                `Added HBAR fee: ${amount} HBAR${
                  fee.collectorAccount ? ` to ${fee.collectorAccount}` : ''
                }`
              );
            }
          }

          const addMoreResponse = await question(
            'Add another HBAR fee? (y/n): '
          );
          addMore = addMoreResponse.toLowerCase() === 'y';
        }

        if (hbarFees.length > 0) {
          feeParams.hbarFees = hbarFees;
        }
      }

      // Configure token fees (can have multiple)
      const configureTokenFees = await question(
        'Configure token fees? (y/n): '
      );
      if (configureTokenFees.toLowerCase() === 'y') {
        let addMore = true;

        while (addMore) {
          const tokenIdStr = await question('Token ID (e.g., 0.0.12345): ');

          if (tokenIdStr.trim() && /^\d+\.\d+\.\d+$/.test(tokenIdStr.trim())) {
            const tokenAmountStr = await question('Token amount per message: ');
            const amount = parseFloat(tokenAmountStr);

            if (isNaN(amount) || amount <= 0) {
              console.log('Invalid token amount. Token fee will not be added.');
            } else {
              const fee: any = {
                amount,
                tokenId: tokenIdStr.trim(),
              };

              const collectorAccount = await question(
                'Collector account ID (leave blank for default): '
              );
              if (collectorAccount.trim()) {
                fee.collectorAccount = collectorAccount.trim();
              }

              tokenFees.push(fee);
              console.log(
                `Added token fee: ${amount} of token ${tokenIdStr}${
                  fee.collectorAccount ? ` to ${fee.collectorAccount}` : ''
                }`
              );
            }
          } else {
            console.log(
              'Invalid token ID format. Token fee will not be added.'
            );
          }

          const addMoreResponse = await question(
            'Add another token fee? (y/n): '
          );
          addMore = addMoreResponse.toLowerCase() === 'y';
        }

        if (tokenFees.length > 0) {
          feeParams.tokenFees = tokenFees;
        }
      }

      // Configure exempt account IDs (applies to both fee types)
      const configureExemptIds = await question(
        'Configure exempt accounts? (y/n): '
      );
      if (configureExemptIds.toLowerCase() === 'y') {
        const exemptAccountsInput = await question(
          'Exempt account IDs (comma-separated, leave blank for none): '
        );

        if (exemptAccountsInput.trim()) {
          const exemptIds = exemptAccountsInput
            .split(',')
            .map((id) => id.trim())
            .filter((id) => /^\d+\.\d+\.\d+$/.test(id));

          if (exemptIds.length === 0) {
            console.log('No valid exempt account IDs provided.');
          } else {
            feeParams.exemptAccountIds = exemptIds;
          }
        }
      }

      // Show fee summary
      console.log('\nFee configuration summary:');
      if (feeParams.defaultCollectorAccount) {
        console.log(
          `- Default collector: ${feeParams.defaultCollectorAccount}`
        );
      }
      if (feeParams.hbarFees && feeParams.hbarFees.length > 0) {
        console.log('- HBAR fees:');
        feeParams.hbarFees.forEach((fee) => {
          console.log(
            `  - ${fee.amount} HBAR${
              fee.collectorAccount ? ` to ${fee.collectorAccount}` : ''
            }`
          );
        });
      }
      if (feeParams.tokenFees && feeParams.tokenFees.length > 0) {
        console.log('- Token fees:');
        feeParams.tokenFees.forEach((fee) => {
          console.log(
            `  - ${fee.amount} of token ${fee.tokenId}${
              fee.collectorAccount ? ` to ${fee.collectorAccount}` : ''
            }`
          );
        });
      }
      if (feeParams.exemptAccountIds && feeParams.exemptAccountIds.length > 0) {
        console.log(
          `- Exempt accounts: ${feeParams.exemptAccountIds.join(', ')}`
        );
      }
      if (!feeParams.hbarFees && !feeParams.tokenFees) {
        console.log('- No fees configured');
      }

      const confirmFees = await question(
        'Proceed with this fee configuration? (y/n): '
      );
      if (confirmFees.toLowerCase() !== 'y') {
        console.log(
          'Fee configuration canceled. Connection request will not be accepted.'
        );
        return;
      }

      const result = await acceptTool.call(feeParams);
      console.log(result);
    } else {
      const result = await acceptTool.call({ requestId: reqId });
      console.log(result);
    }
  } catch (error) {
    console.error('\nError accepting connection request:', error);
  }
}

main();
