import * as dotenv from 'dotenv';
import { initializeHCS10Client } from '../src/index';
import { HCS10Client } from '../src/hcs10/HCS10Client';
import { ConnectionTool } from '../src/tools/ConnectionTool';
import { ConnectionMonitorTool } from '../src/tools/ConnectionMonitorTool';
import { ListConnectionsTool } from '../src/tools/ListConnectionsTool';
import { InitiateConnectionTool } from '../src/tools/InitiateConnectionTool';
import { SendMessageToConnectionTool } from '../src/tools/SendMessageToConnectionTool';
import { CheckMessagesTool } from '../src/tools/CheckMessagesTool';
import { ManageConnectionRequestsTool } from '../src/tools/ManageConnectionRequestsTool';
import { AcceptConnectionRequestTool } from '../src/tools/AcceptConnectionRequestTool';
import { ListUnapprovedConnectionRequestsTool } from '../src/tools/ListUnapprovedConnectionRequestsTool';
import { OpenConvaiState } from '../src/state/open-convai-state';
import readline from 'readline';
import { RegisterAgentTool } from '../src/tools/RegisterAgentTool';

dotenv.config();

// const __filename = fileURLToPath(import.meta.url); // Unused
// const __dirname = path.dirname(__filename); // Unused
// const projectRoot = path.join(__dirname, '..'); // Unused

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

// Define fee-related types at file level
interface FeeBase {
  amount: number;
  collectorAccount?: string;
}

interface TokenFee extends FeeBase {
  tokenId: string;
}

interface FeeConfiguration {
  defaultCollectorAccountId: string;
  hbarFees: FeeBase[];
  tokenFees: TokenFee[];
  exemptAccountIds: string[];
}

async function promptForFeesConfiguration(): Promise<FeeConfiguration | null> {
  const configureFees = await question(
    'Configure fees for this agent? (y/n): '
  );
  if (configureFees.toLowerCase() !== 'y') {
    return null;
  }

  const feeConfig: FeeConfiguration = {
    defaultCollectorAccountId: '',
    hbarFees: [],
    tokenFees: [],
    exemptAccountIds: [],
  };

  // Get default collector account
  feeConfig.defaultCollectorAccountId = await question(
    'Default fee collector account ID (leave blank to use agent account): '
  );

  // Configure HBAR fees (multiple allowed)
  await configureHbarFees(feeConfig);

  // Configure token fees (multiple allowed)
  await configureTokenFees(feeConfig);

  // Configure exempt account IDs
  await configureExemptAccounts(feeConfig);

  // Show fee summary and confirm
  if (showFeeSummary(feeConfig) && (await confirmFeeConfiguration())) {
    return feeConfig;
  }
  return null;
}

async function configureHbarFees(feeConfig: FeeConfiguration): Promise<void> {
  const configureHbarFees = await question('Configure HBAR fees? (y/n): ');
  if (configureHbarFees.toLowerCase() !== 'y') {
    return;
  }

  const MAX_FEES = 10;
  const totalCurrentFees =
    feeConfig.hbarFees.length + feeConfig.tokenFees.length;
  let feesRemaining = MAX_FEES - totalCurrentFees;

  while (feesRemaining > 0) {
    const feeIndex = feeConfig.hbarFees.length + 1;
    const fee = await promptForHbarFee(
      feeIndex,
      feeConfig.defaultCollectorAccountId
    );

    if (!fee) {
      break;
    }

    feeConfig.hbarFees.push(fee);
    feesRemaining--;

    if (feesRemaining <= 0) {
      console.log(`Maximum number of fees (${MAX_FEES}) reached.`);
      break;
    }

    const addAnother = await question(
      `Add another HBAR fee? (${
        MAX_FEES - feesRemaining
      }/${MAX_FEES} fees configured) (y/n): `
    );
    if (addAnother.toLowerCase() !== 'y') {
      break;
    }
  }
}

async function promptForHbarFee(
  index: number,
  defaultCollector: string
): Promise<FeeBase | null> {
  const hbarFeeStr = await question(`HBAR fee amount for fee #${index}: `);
  if (!hbarFeeStr.trim()) {
    return null;
  }

  const amount = parseFloat(hbarFeeStr);
  if (isNaN(amount) || amount <= 0) {
    console.log('Invalid HBAR fee amount. Fee will not be added.');
    return null;
  }

  const fee: FeeBase = { amount };
  const useDefaultCollector = await question(
    'Use default collector account for this fee? (y/n): '
  );
  if (useDefaultCollector.toLowerCase() !== 'y') {
    const collectorAccount = await question(
      'Collector account ID for this fee: '
    );
    if (collectorAccount.trim()) {
      fee.collectorAccount = collectorAccount.trim();
    }
  }

  const collectorDisplay = getCollectorDisplay(
    fee.collectorAccount,
    defaultCollector
  );
  console.log(`Added HBAR fee: ${amount} HBAR ${collectorDisplay}`);

  return fee;
}

async function configureTokenFees(feeConfig: FeeConfiguration): Promise<void> {
  const configureTokenFees = await question('Configure token fees? (y/n): ');
  if (configureTokenFees.toLowerCase() !== 'y') {
    return;
  }

  const MAX_FEES = 10;
  const totalCurrentFees =
    feeConfig.hbarFees.length + feeConfig.tokenFees.length;
  let feesRemaining = MAX_FEES - totalCurrentFees;

  while (feesRemaining > 0) {
    const feeIndex = totalCurrentFees + feeConfig.tokenFees.length + 1;
    const fee = await promptForTokenFee(
      feeIndex,
      feeConfig.defaultCollectorAccountId
    );

    if (!fee) {
      break;
    }

    feeConfig.tokenFees.push(fee);
    feesRemaining--;

    if (feesRemaining <= 0) {
      console.log(`Maximum number of fees (${MAX_FEES}) reached.`);
      break;
    }

    const addAnother = await question(
      `Add another token fee? (${
        MAX_FEES - feesRemaining
      }/${MAX_FEES} fees configured) (y/n): `
    );
    if (addAnother.toLowerCase() !== 'y') {
      break;
    }
  }
}

async function promptForTokenFee(
  index: number,
  defaultCollector: string
): Promise<TokenFee | null> {
  const tokenIdStr = await question(
    `Token ID for fee #${index} (e.g., 0.0.12345): `
  );
  if (!tokenIdStr.trim() || !/^\d+\.\d+\.\d+$/.test(tokenIdStr.trim())) {
    console.log('Invalid token ID format. Token fee will not be added.');
    return null;
  }

  const tokenAmountStr = await question('Token amount per message: ');
  const amount = parseFloat(tokenAmountStr);

  if (isNaN(amount) || amount <= 0) {
    console.log('Invalid token amount. Token fee will not be added.');
    return null;
  }

  const fee: TokenFee = {
    amount,
    tokenId: tokenIdStr.trim(),
  };

  const useDefaultCollector = await question(
    'Use default collector account for this fee? (y/n): '
  );
  if (useDefaultCollector.toLowerCase() !== 'y') {
    const collectorAccount = await question(
      'Collector account ID for this fee: '
    );
    if (collectorAccount.trim()) {
      fee.collectorAccount = collectorAccount.trim();
    }
  }

  const collectorDisplay = getCollectorDisplay(
    fee.collectorAccount,
    defaultCollector
  );
  console.log(
    `Added token fee: ${amount} of token ${fee.tokenId} ${collectorDisplay}`
  );

  return fee;
}

function getCollectorDisplay(
  specificCollector?: string,
  defaultCollector?: string
): string {
  if (specificCollector) {
    return `to be collected by ${specificCollector}`;
  } else if (defaultCollector) {
    return `to be collected by ${defaultCollector}`;
  } else {
    return 'to be collected by agent account';
  }
}

async function configureExemptAccounts(
  feeConfig: FeeConfiguration
): Promise<void> {
  const configureExemptIds = await question(
    'Configure exempt accounts? (y/n): '
  );
  if (configureExemptIds.toLowerCase() !== 'y') {
    return;
  }

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
      feeConfig.exemptAccountIds = exemptIds;
      console.log(`Added ${exemptIds.length} exempt account(s).`);
    }
  }
}

function showFeeSummary(feeConfig: FeeConfiguration): boolean {
  const hasAnyFees =
    feeConfig.hbarFees.length > 0 || feeConfig.tokenFees.length > 0;

  console.log('\nFee configuration summary:');

  if (feeConfig.defaultCollectorAccountId) {
    console.log(`- Default collector: ${feeConfig.defaultCollectorAccountId}`);
  }

  if (feeConfig.hbarFees.length > 0) {
    console.log('- HBAR fees:');
    feeConfig.hbarFees.forEach((fee) => {
      console.log(
        `  - ${fee.amount} HBAR ${
          fee.collectorAccount
            ? `to ${fee.collectorAccount}`
            : 'to default collector'
        }`
      );
    });
  }

  if (feeConfig.tokenFees.length > 0) {
    console.log('- Token fees:');
    feeConfig.tokenFees.forEach((fee) => {
      console.log(
        `  - ${fee.amount} of token ${fee.tokenId} ${
          fee.collectorAccount
            ? `to ${fee.collectorAccount}`
            : 'to default collector'
        }`
      );
    });
  }

  if (feeConfig.exemptAccountIds.length > 0) {
    console.log(`- Exempt accounts: ${feeConfig.exemptAccountIds.join(', ')}`);
  }

  if (!hasAnyFees) {
    console.log('- No fees configured');
  }

  return hasAnyFees;
}

async function confirmFeeConfiguration(): Promise<boolean> {
  const confirmFees = await question(
    'Proceed with this fee configuration? (y/n): '
  );
  if (confirmFees.toLowerCase() !== 'y') {
    console.log('Fee configuration canceled. Proceeding without fees.');
    return false;
  }
  return true;
}

// --- Agent Actions ---
async function registerNewAgent() {
  displayHeader('Register New Agent');
  const name = await question('Enter agent name: ');
  const description = await question('Enter agent description (optional): ');
  const model = await question(
    'Enter agent model identifier (optional, e.g., gpt-4o): '
  );

  if (!name) {
    console.error('Agent name is required.');
    return;
  }

  // Display capabilities and let user select
  displayCapabilities();
  console.log(
    '\nSelect capabilities (comma-separated numbers, e.g., "0,4,7"): '
  );
  const capabilitiesInput = await question('> ');
  let capabilities: number[] | undefined = undefined;
  try {
    if (capabilitiesInput.trim()) {
      capabilities = capabilitiesInput.split(',').map((num) => {
        const parsed = parseInt(num.trim(), 10);
        if (isNaN(parsed) || parsed < 0 || parsed > 18) {
          throw new Error(`Invalid capability number: ${num.trim()}`);
        }
        return parsed;
      });
      if (capabilities.length === 0) {
        console.log('No valid capabilities selected, using tool default.');
        capabilities = undefined; // Let tool default if empty after parse
      }
    } else {
      console.log('Using tool default capabilities (TEXT_GENERATION).');
      capabilities = undefined; // Explicitly undefined to use default
    }
  } catch (error) {
    console.error(
      `Error parsing capabilities: ${
        error instanceof Error ? error.message : error
      }`
    );
    console.log('Using tool default capabilities (TEXT_GENERATION).');
    capabilities = undefined;
  }

  console.log(`Selected capabilities: ${capabilities ? capabilities.join(', ') : 'Default'}`);

  // Handle fee configuration
  const feeConfig = await promptForFeesConfiguration();

  // PFP Handling Removed - RegisterAgentTool does not support it yet
  // const pfpPath = await question(...);
  // ... pfp file reading logic removed ...

  // --- Use RegisterAgentTool ---
  try {
    console.log(
      `\nRegistering agent "${name}" using RegisterAgentTool... this may take several minutes.`
    );

    const registerTool = new RegisterAgentTool(hcsClient);

    // Prepare input based on tool schema
    const toolInput: Record<string, any> = {
      name,
      description,
      model,
      capabilities,
    };

    if (feeConfig) {
      toolInput.feeCollectorAccountId = feeConfig.defaultCollectorAccountId || undefined;
      toolInput.hbarFees = feeConfig.hbarFees.length > 0 ? feeConfig.hbarFees : undefined;
      toolInput.tokenFees = feeConfig.tokenFees.length > 0 ? feeConfig.tokenFees : undefined;
      toolInput.exemptAccountIds = feeConfig.exemptAccountIds.length > 0 ? feeConfig.exemptAccountIds : undefined;
    }

    // Invoke the tool
    const resultString = await registerTool.invoke(toolInput);

    // Process the result string
    try {
      const result = JSON.parse(resultString);

      if (result.success && result.accountId && result.privateKey && result.inboundTopicId && result.outboundTopicId) {
        const newAgent: RegisteredAgent = {
          name: result.name,
          accountId: result.accountId,
          inboundTopicId: result.inboundTopicId,
          outboundTopicId: result.outboundTopicId,
          profileTopicId: result.profileTopicId !== 'N/A' ? result.profileTopicId : undefined,
          operatorPrivateKey: result.privateKey,
        };

        // Note: Tool already updates .env file internally
        // await updateEnvFile(ENV_FILE_PATH, { ... });

        registeredAgents.push(newAgent);
        console.log('\nRegistration Successful!');
        console.log(result.message || resultString);
        displayAgentInfo(newAgent);

        // Automatically select the newly registered agent if it's the first one
        if (registeredAgents.length === 1) {
          currentAgent = newAgent;
          // Reconfigure client and tools for the new agent
          hcsClient = new HCS10Client(
            currentAgent.accountId,
            currentAgent.operatorPrivateKey,
            hcsClient.getNetwork(),
            {
              useEncryption: false,
              registryUrl: process.env.REGISTRY_URL || 'https://moonscape.tech',
            }
          );
          connectionTool = new ConnectionTool({ client: hcsClient, stateManager });
          connectionMonitorTool.updateClient(hcsClient);
          stateManager.setCurrentAgent(currentAgent);
          console.log(
            `\nAgent "${currentAgent.name}" automatically selected as active agent.`
          );
          console.log('Client and tools reconfigured.');
        } else {
           // Update state manager if an agent was already active
           if (currentAgent) {
              stateManager.setCurrentAgent(currentAgent);
           } else {
              // If no agent was active, select the new one
              console.log(`\nPlease select agent ${registeredAgents.length} to make it active.`);
           }
        }
      } else {
        // Handle cases where parsing succeeded but registration wasn't fully successful
        console.error('Registration via tool reported an issue or missing data:');
        console.log(result.message || resultString);
      }
    } catch (parseError) {
      // Handle cases where the result string wasn't valid JSON (likely an error message)
      console.error('\nRegistration failed. Tool returned an error:');
      console.error(resultString);
    }

  } catch (error) {
    // Catch unexpected errors during tool instantiation or invocation
    console.error('\nError during agent registration process:', error);
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
    const result = await connectionMonitorTool.invoke({
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

    const result = await initiateConnectionTool.invoke({ targetAccountId });
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
    console.log(
      `Fetching connections for ${currentAgent.name} (${currentAgent.accountId})...`
    );

    if (!stateManager) {
      console.error('State manager is not initialized!');
      return;
    }

    // Create the ListConnectionsTool on demand with current hcsClient
    const listTool = new ListConnectionsTool({ stateManager, hcsClient });

    const connectionListOutput = await listTool.invoke({
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
        const result = await manageTool.invoke({ action: 'list' });
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
        const result = await manageTool.invoke({
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

          const result = await acceptTool.invoke({
            requestId: reqId,
            hbarFee,
            exemptAccountIds: exemptIds,
          });
          console.log(result);
        } else {
          const result = await acceptTool.invoke({
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
        const result = await manageTool.invoke({
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
    await listTool.invoke({
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
    const result = await sendMessageToConnectionTool.invoke({
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
    const result = await checkMessagesTool.invoke({
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

async function listUnapprovedConnectionRequests() {
  displayHeader('Unapproved Connection Requests');
  if (!currentAgent) {
    console.log('No active agent selected.');
    return;
  }

  try {
    console.log(
      `Fetching unapproved connection requests for ${currentAgent.name} (${currentAgent.accountId})...`
    );

    if (!stateManager) {
      console.error('State manager is not initialized!');
      return;
    }

    const listTool = new ListUnapprovedConnectionRequestsTool({
      stateManager,
      hcsClient,
    });

    const requestsOutput = await listTool.invoke({});
    console.log(requestsOutput);
  } catch (error) {
    console.error('\nError listing unapproved connection requests:', error);
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
  console.log('  12. List Unapproved Connection Requests');
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
    case '12':
      await listUnapprovedConnectionRequests();
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
    const listResult = await manageTool.invoke({ action: 'list' });
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

    interface FeeParams {
      requestId: number;
      defaultCollectorAccount?: string;
      hbarFees?: Array<{
        amount: number;
        collectorAccount?: string;
      }>;
      tokenFees?: Array<{
        amount: number;
        tokenId: string;
        collectorAccount?: string;
      }>;
      exemptAccountIds?: string[];
    }

    const feeParams: FeeParams = { requestId: reqId };
    const configureFees = await question(
      'Configure fees for this connection? (y/n): '
    );

    if (configureFees.toLowerCase() === 'y') {
      const hbarFees: Array<{
        amount: number;
        collectorAccount?: string;
      }> = [];
      const tokenFees: Array<{
        amount: number;
        tokenId: string;
        collectorAccount?: string;
      }> = [];
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
              const fee: { amount: number; collectorAccount?: string } = {
                amount,
              };

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
              const fee: {
                amount: number;
                tokenId: string;
                collectorAccount?: string;
              } = {
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

      const result = await acceptTool.invoke(feeParams);
      console.log(result);
    } else {
      const result = await acceptTool.invoke({ requestId: reqId });
      console.log(result);
    }
  } catch (error) {
    console.error('\nError accepting connection request:', error);
  }
}

main();
