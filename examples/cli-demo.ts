import * as dotenv from 'dotenv';
import { initializeHCS10Client } from '../src/index';
import { HCS10Client, ExtendedAgentMetadata } from '../src/hcs10/HCS10Client';
import { ConnectionTool } from '../src/tools/ConnectionTool';
import { ListConnectionsTool } from '../src/tools/ListConnectionsTool';
import { InitiateConnectionTool } from '../src/tools/InitiateConnectionTool';
import { SendMessageToConnectionTool } from '../src/tools/SendMessageToConnectionTool';
import { CheckMessagesTool } from '../src/tools/CheckMessagesTool';
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
let connectionTool: ConnectionTool; // Keep this global since it manages state for monitoring
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
    // Use the connection tool's internal method to start monitoring
    const result = await connectionTool._call({
      inboundTopicId: currentAgent.inboundTopicId,
    });
    console.log(result);
    if (result.startsWith('Started monitoring')) {
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
    connectionTool.stopMonitoring();
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

  if (stateManager.listConnections().some((c) => c.targetAccountId === targetAccountId && !c.isPending && !c.needsConfirmation)) {
    console.log(`Already have an established connection with ${targetAccountId}.`);
    return;
  }

  try {
    console.log(`
Initiating connection to ${targetAccountId}...`);

    // Create the InitiateConnectionTool on demand with current hcsClient
    const initiateConnectionTool = new InitiateConnectionTool({ 
      hcsClient, 
      stateManager 
    });
    const result = await initiateConnectionTool._call({ targetAccountId });

    console.log(result);

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
    console.log(`Fetching connections for ${currentAgent.name} (${currentAgent.accountId})...`);

    if (!stateManager) {
        console.error('State manager is not initialized!');
        return;
    }
    
    // Create the ListConnectionsTool on demand with current hcsClient
    const listTool = new ListConnectionsTool({ stateManager, hcsClient });

    const connectionListOutput = await listTool._call({
      includeDetails: true,
      showPending: true,
    });

    console.log(connectionListOutput);

  } catch (error) {
    console.error('\\nError listing connections using ListConnectionsTool:', error);
  }
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
    await listTool._call({
      includeDetails: false,
      showPending: true
    });
  } catch (error) {
    console.error('Error refreshing connections:', error);
    // Continue with what we have in state, even if refresh failed
  }

  // Now get the updated list from state manager
  const currentConnections = stateManager.listConnections();
  console.log(`Found ${currentConnections.length} connections in state manager.`);

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
    
    // Create the SendMessageToConnectionTool on demand with current hcsClient
    const sendMessageToConnectionTool = new SendMessageToConnectionTool({ 
      hcsClient, 
      stateManager 
    });
    const result = await sendMessageToConnectionTool._call({
      targetIdentifier: connection.targetAccountId,
      message: messageContent
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
    
    // Create the CheckMessagesTool on demand with current hcsClient
    const checkMessagesTool = new CheckMessagesTool({ 
      hcsClient, 
      stateManager 
    });
    const result = await checkMessagesTool._call({
      targetIdentifier: connection.connectionTopicId
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
    // No global tool creation here - tools will be created on demand
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

      // Update the state manager with the current agent
      stateManager.setCurrentAgent(currentAgent);
    } else {
      console.log(
        'Todd agent details not found in environment variables. Register or select an agent manually.'
      );
    }
    // ---> END ADDITION

    await showMenu();
  } catch (error) {
    console.error('Failed to initialize HCS10 client:', error);
    rl.close();
  }
}

main();
