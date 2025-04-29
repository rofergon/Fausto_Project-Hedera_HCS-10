import * as dotenv from 'dotenv';
import readline from 'readline';

import { HCS10Client } from '../src/hcs10/HCS10Client';

import { ConnectionMonitorTool } from '../src/tools/ConnectionMonitorTool';
import { AcceptConnectionRequestTool } from '../src/tools/AcceptConnectionRequestTool';
import { ManageConnectionRequestsTool } from '../src/tools/ManageConnectionRequestsTool';
import { CheckMessagesTool } from '../src/tools/CheckMessagesTool';
import { ConnectionTool } from '../src/tools/ConnectionTool';
import { RegisterAgentTool } from '../src/tools/RegisterAgentTool';
import { FindRegistrationsTool } from '../src/tools/FindRegistrationsTool';
import { InitiateConnectionTool } from '../src/tools/InitiateConnectionTool';
import { ListConnectionsTool } from '../src/tools/ListConnectionsTool';
import { SendMessageToConnectionTool } from '../src/tools/SendMessageToConnectionTool';
import { SendMessageTool } from '../src/tools/SendMessageTool';
import { IStateManager } from '../src/state/state-types';
import { OpenConvaiState } from '../src/state/open-convai-state';

// Import plugin system components
import { PluginRegistry, PluginContext } from '../src/plugins';
import WeatherPlugin from './plugins/weather';
import DeFiPlugin from './plugins/defi';
import { HbarPricePlugin } from '../src/plugins/hedera/HbarPricePlugin';
import SauceSwapPlugin from './plugins/SauceSwap/index';

// --- LangChain Imports ---
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { ConversationTokenBufferMemory } from 'langchain/memory';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { StructuredToolInterface } from '@langchain/core/tools';
import { RetrieveProfileTool } from '../src/tools/RetrieveProfileTool';
import { Logger } from '@hashgraphonline/standards-sdk';

dotenv.config();

interface AgentIdentity {
  name: string;
  accountId: string;
  privateKey: string;
  inboundTopicId: string;
  outboundTopicId: string;
  profileTopicId?: string;
}

export interface HCSMessage {
  op?: string;
  sequence_number?: number;
  created?: Date;
  data?: string;
  operator_id?: string;
  connection_topic_id?: string;
  connection_request_id?: number;
  uniqueRequestKey?: string;
}

// --- Configuration ---
const AGENT_PERSONALITY = `You are a helpful assistant managing Hedera HCS-10 connections and messages.
You have access to tools for registering agents, finding registered agents, initiating connections, listing active connections, sending messages over connections, and checking for new messages.
The current agent you are operating as is configured via environment variables (OPERATOR_ID), but can switch if a new agent is registered.
When asked to perform an action, use the available tools. Ask for clarification if needed.
Be concise and informative in your responses.

You also have access to a plugin system that provides additional tools for various functionalities:
- Weather tools: Get current weather and weather forecasts for locations
- DeFi tools: Get token prices, check token balances, and simulate token swaps
- Hedera tools: Get the current HBAR price
- SauceSwap tools: Get information about SauceSwap V2 pools and liquidity. The pools are shown 5 at a time using pagination. Use the 'page' parameter to navigate through pages (e.g., page=1 for first 5 pools, page=2 for next 5, etc.)

*** IMPORTANT TOOL SELECTION RULES ***
- To REGISTER a new agent, use 'register_agent'.
- To FIND existing registered agents in the registry, use 'find_registrations'. You can filter by accountId or tags.
- To START a NEW connection TO a specific target agent (using their account ID), ALWAYS use the 'initiate_connection' tool.
- To LISTEN for INCOMING connection requests FROM other agents, use the 'monitor_connections' tool (it takes NO arguments).
- To SEND a message to a specific agent, use the 'send_message_to_connection' tool.
- To ACCEPT incoming connection requests, use the 'accept_connection_request' tool.
- To MANAGE and VIEW pending connection requests, use the 'manage_connection_requests' tool.
- To CHECK FOR *NEW* messages since the last check, use the 'check_messages' tool.
- To GET THE *LATEST* MESSAGE(S) in a conversation, even if you might have seen them before, use the 'check_messages' tool and set the parameter 'fetchLatest: true'. You can optionally specify 'lastMessagesCount' to get more than one latest message (default is 1).
- For WEATHER information, use the appropriate weather plugin tools.
- For DeFi operations, use the appropriate DeFi plugin tools.
- For the CURRENT HBAR PRICE, use the 'getHbarPrice' tool.
- For SauceSwap information:
  * Use 'get_sauceswap_pools' to get information about available pools
    - Shows 5 pools per page
    - Use the 'page' parameter to navigate (e.g., page=1, page=2, etc.)
    - If no page is specified, defaults to page 1
    - The tool will tell you how many pages are available
  * Use 'get_sauceswap_pool_details' to get detailed information about a specific pool
    - Requires a pool ID (number)
    - Returns detailed information about the pool including:
      - LP token details (name, symbol, decimals, price, total reserve)
      - Token A and B details (name, symbol, decimals, price, reserve, website, description)
    - Works on both mainnet and testnet (defaults to mainnet)
  * Use 'get_sauceswap_candlestick' to get price chart data for a specific pool
    - Requires a pool ID (number)
    - Optional parameters:
      - interval: Time interval for the candlestick data
        - 'FIVE': 5-minute intervals
        - 'MIN': 1-minute intervals
        - 'HOUR': 1-hour intervals (default)
        - 'DAY': Daily intervals
        - 'WEEK': Weekly intervals
      - inverted: Set to true to invert the price calculation (default: false)
      - network: 'mainnet' or 'testnet' (default: mainnet)
    - Returns detailed candlestick data including:
      - Open, high, low, and close prices
      - Average price
      - Volume and liquidity information
      - Timestamps in both Unix and human-readable format
    - Examples:
      - "Get hourly candlestick data for pool 1"
      - "Show me the daily price chart for pool 2"
      - "What's the weekly price data for pool 3"
      - "Get 5-minute candlestick data for pool 4"
  * Use 'get_sauceswap_token_details' to get detailed information about a specific token
    - Requires a token ID (string, e.g., "0.0.731861")
    - Returns detailed information about the token including:
      - Name, symbol, and decimals
      - Price in USD
      - Description, website, and social links
      - Due diligence status and other token properties
    - Works on both mainnet and testnet (defaults to mainnet)
  * Use 'get_sauceswap_associated_pools' to find all pools that contain a specific token
    - Requires a token ID (string, e.g., "0.0.731861")
    - Returns a list of all pools where the token is either tokenA or tokenB
    - For each pool, returns:
      - Pool ID and contract ID
      - LP token information (name, symbol, price, total reserve)
      - Both tokens in the pool with their details (name, symbol, price, reserves)
    - Works on both mainnet and testnet (defaults to mainnet)
    - Useful for finding all trading pairs for a specific token
  
  * WORKFLOW FOR TOKEN AND PRICE QUERIES:
    - When a user asks about available pools, use 'get_sauceswap_pools' first
    - If the user asks about price history or charts:
      1. First identify the pool ID (if not provided)
      2. Use 'get_sauceswap_candlestick' with appropriate interval:
         - For recent price movements: use 'FIVE' or 'MIN' intervals
         - For daily trading patterns: use 'HOUR' interval
         - For longer-term trends: use 'DAY' or 'WEEK' intervals
    - If the user asks about a specific token BY NAME (like "SAUCE" or "HBAR"):
      1. NEVER try to guess the token ID - this will fail
      2. ALWAYS first use 'get_sauceswap_pools' to get a list of pools 
      3. Look for the token name in the pool results
      4. Once you find a pool containing that token, you can either:
         a) Use 'get_sauceswap_pool_details' with that pool's ID for detailed pool information
         b) Use 'get_sauceswap_associated_pools' with the token's ID to find ALL pools containing that token
         c) Use 'get_sauceswap_token_details' with the token's ID for token-specific information
         d) Use 'get_sauceswap_candlestick' to get price history for any pool
    - If user provides a token ID directly (like "0.0.731861"), you can use any of these tools directly:
      * 'get_sauceswap_token_details' for token information
      * 'get_sauceswap_associated_pools' to find all pools containing that token
    - If the user asks about "trading pairs" or "liquidity pools" for a specific token:
      1. If you have the token ID, use 'get_sauceswap_associated_pools' directly
      2. If you only have the token name, follow the token name workflow above
    - If the user asks for "details about tokens" or "token details" without specifying a particular token:
      1. First use 'get_sauceswap_pools' to get pools information
      2. Identify the main tokens from those pools (avoid duplicates)
      3. For EACH unique token, you can use both:
         - 'get_sauceswap_token_details' for token information
         - 'get_sauceswap_associated_pools' to show where the token is being traded
         - 'get_sauceswap_candlestick' to show recent price history
    - NEVER attempt to call any tool without first identifying the correct token ID through pool information
    - If you can't find the token in any pool, inform the user that you can't find information about that token

Remember the connection numbers when listing connections, as users might refer to them.`;

const WELCOME_MESSAGE = `Hello! I'm your SauceSwap assistant. I can help you with:

🔍 Exploring SauceSwap Pools:
- View list of available pools (5 pools per page)
- Get specific details of any pool
- Navigate between pool pages

📊 Token Information:
- Get complete token details
- View current prices
- Check liquidity information
- Access reserve data

📈 Price History & Charts:
- Get candlestick data for any pool
- View price history at different intervals:
  • 5-minute data for recent movements
  • Hourly data for intraday analysis
  • Daily and weekly data for trends
- Track volume and liquidity changes

To get started, you can ask me about:
- "Show me the available pools"
- "Give me details of pool #[number]"
- "What's the price history for pool #[number]"
- "Show me the hourly chart for pool #[number]"
- "What information do you have about token [token ID]?"

I'm here to help! 🚀`;

// --- Global Variables ---
let hcsClient: HCS10Client;
let stateManager: IStateManager;
let agentExecutor: AgentExecutor | null = null;
let memory: ConversationTokenBufferMemory;
let connectionMonitor: ConnectionTool | null = null;
let connectionMonitorTool: ConnectionMonitorTool | null = null;
let tools: StructuredToolInterface[] = [];

// Plugin system state
let pluginRegistry: PluginRegistry | null = null;
let pluginContext: PluginContext | null = null;

// Message tracking state
const processedMessages: Map<string, Set<number>> = new Map();
const messagesInProcess: Map<string, Set<number>> = new Map();
const lastProcessedTimestamps: Map<string, number> = new Map();

/**
 * Loads agent details from environment variables using a specified prefix
 */
async function loadAgentFromEnv(prefix: string): Promise<AgentIdentity | null> {
  const accountId = process.env[`${prefix}_ACCOUNT_ID`];
  const privateKey = process.env[`${prefix}_PRIVATE_KEY`];
  const inboundTopicId = process.env[`${prefix}_INBOUND_TOPIC_ID`];
  const outboundTopicId = process.env[`${prefix}_OUTBOUND_TOPIC_ID`];
  const profileTopicId = process.env[`${prefix}_PROFILE_TOPIC_ID`];

  if (!accountId || !privateKey || !inboundTopicId || !outboundTopicId) {
    console.log(`Incomplete agent details for prefix ${prefix}, skipping.`);
    return null;
  }

  return {
    name: `${prefix} Agent`,
    accountId,
    privateKey,
    inboundTopicId,
    outboundTopicId,
    profileTopicId,
  };
}

/**
 * Displays available agents and prompts user to select one
 */
async function promptUserToSelectAgent(
  agents: AgentIdentity[]
): Promise<AgentIdentity | null> {
  if (agents.length === 0) {
    console.log('No agents available. Please register a new agent first.');
    return null;
  }

  if (agents.length === 1) {
    console.log(`Auto-selecting the only available agent: ${agents[0].name}`);
    return agents[0];
  }

  console.log('\nAvailable agents:');
  agents.forEach((agent, index) => {
    console.log(`${index + 1}. ${agent.name} (${agent.accountId})`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const choice = await new Promise<string>((resolve) => {
    rl.question(
      'Select agent number (or press Enter to use first agent): ',
      resolve
    );
  });
  rl.close();

  if (!choice.trim()) {
    console.log(`Defaulting to first agent: ${agents[0].name}`);
    return agents[0];
  }

  const index = parseInt(choice) - 1;
  if (isNaN(index) || index < 0 || index >= agents.length) {
    console.log(`Invalid choice. Defaulting to first agent: ${agents[0].name}`);
    return agents[0];
  }

  return agents[index];
}

/**
 * Initializes message tracking for all established connections
 */
async function initializeMessageTracking() {
  console.log('Initializing message tracking system...');
  
  const connections = stateManager
    .listConnections()
    .filter((conn) => conn.status === 'established');

  for (const conn of connections) {
    const topicId = conn.connectionTopicId;
    if (!topicId.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
      console.warn(`Skipping invalid topic ID format: ${topicId}`);
      continue;
    }

    processedMessages.set(topicId, new Set<number>());
    messagesInProcess.set(topicId, new Set<number>());
    lastProcessedTimestamps.set(topicId, Date.now() - 24 * 60 * 60 * 1000);

    console.log(`Initialized message tracking for topic ${topicId}`);
  }
}

/**
 * Handles processing and responding to incoming messages
 */
async function handleIncomingMessage(message: HCSMessage, topicId: string) {
  // Initialize sequence number with default value
  const sequenceNumber = message.sequence_number || -1;

  try {
    if (!message.data || message.sequence_number === undefined) {
      return;
    }

    // Skip messages from self
    if (message.operator_id && message.operator_id.includes(hcsClient.getOperatorId())) {
      console.log(`Skipping own message #${sequenceNumber}`);
      return;
    }

    // Get or initialize the processed messages set for this topic
    let processedSet = processedMessages.get(topicId);
    if (!processedSet) {
      processedSet = new Set<number>();
      processedMessages.set(topicId, processedSet);
    }

    // Get or initialize the in-process messages set for this topic
    let inProcessSet = messagesInProcess.get(topicId);
    if (!inProcessSet) {
      inProcessSet = new Set<number>();
      messagesInProcess.set(topicId, inProcessSet);
    }

    // Check if message was already processed or is being processed
    if (processedSet.has(sequenceNumber)) {
      console.log(`Skipping already processed message #${sequenceNumber}`);
      return;
    }

    if (inProcessSet.has(sequenceNumber)) {
      console.log(`Message #${sequenceNumber} is already being processed`);
      return;
    }

    // Mark message as in process
    inProcessSet.add(sequenceNumber);

    console.log(`Processing message #${sequenceNumber}: ${message.data.substring(0, 100)}${message.data.length > 100 ? '...' : ''}`);

    let messageText = message.data;
    try {
      // Try to parse JSON if the message is JSON
      if (messageText.startsWith('{') || messageText.startsWith('[')) {
        const jsonData = JSON.parse(messageText);
        if (typeof jsonData === 'object') {
          messageText = JSON.stringify(jsonData, null, 2);
        }
      }
    } catch (error) {
      // If not valid JSON, use raw text
      console.debug('Message is not JSON, using raw text');
    }

    // Check if agentExecutor is initialized
    if (!agentExecutor) {
      console.error('Agent executor not initialized');
      return;
    }

    // Process message
    const response = await agentExecutor.invoke({
      input: messageText,
      chat_history: [] // Initialize empty chat history for each new message
    });

    // Extract just the output string from the response
    const outputText = typeof response.output === 'string' 
      ? response.output 
      : response.output?.output || response.output?.text || JSON.stringify(response.output);

    // Send response using SendMessageTool
    const sendMessageTool = tools.find(t => t instanceof SendMessageTool) as SendMessageTool;
    if (sendMessageTool) {
      const responseMessage = `[Reply to #${sequenceNumber}] ${outputText}`;
      
      await sendMessageTool.invoke({
        topicId: topicId,
        message: responseMessage,
        memo: `Reply to message #${sequenceNumber}`,
        disableMonitoring: true,
      });

      console.log(`Sent response to message #${sequenceNumber}`);
    }

    // Mark message as processed AFTER successful processing
    if (processedSet) {
      processedSet.add(sequenceNumber);
    }
    
    if (message.created) {
      lastProcessedTimestamps.set(topicId, message.created.getTime());
    }

  } catch (error) {
    console.error(`Error processing message #${sequenceNumber}:`, error);
    
    // Try to send error message
    try {
      const sendMessageTool = tools.find(t => t instanceof SendMessageTool) as SendMessageTool;
      if (sendMessageTool) {
        await sendMessageTool.invoke({
          topicId: topicId,
          message: `[Error Reply to #${sequenceNumber}] Sorry, I encountered an error while processing your message. Please try again.`,
          memo: `Error response to message #${sequenceNumber}`,
          disableMonitoring: true,
        });
      }
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }

    // Mark message as processed even if it failed
    let errorProcessedSet = processedMessages.get(topicId);
    if (!errorProcessedSet) {
      errorProcessedSet = new Set<number>();
      processedMessages.set(topicId, errorProcessedSet);
    }
    errorProcessedSet.add(sequenceNumber);
  } finally {
    // Always remove from in-process set
    let inProcessSet = messagesInProcess.get(topicId);
    if (inProcessSet) {
      inProcessSet.delete(sequenceNumber);
    }
  }
}

/**
 * Checks for and processes new messages from all established connections
 */
async function checkForNewMessages() {
  const connections = stateManager
    .listConnections()
    .filter((conn) => conn.status === 'established');

  for (const conn of connections) {
    const topicId = conn.connectionTopicId;
    if (!topicId.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
      console.warn(`Skipping invalid topic ID format: ${topicId}`);
      continue;
    }

    try {
      // Get the last processed timestamp for this topic
      const lastTimestamp = lastProcessedTimestamps.get(topicId) || 0;

      // Get messages from the topic
      const messages = await hcsClient.getMessageStream(topicId);
      
      for (const message of messages.messages) {
        if (
          message.sequence_number && 
          message.op === 'message' &&
          message.created &&
          message.created.getTime() > lastTimestamp &&
          message.operator_id &&
          !message.operator_id.includes(hcsClient.getOperatorId()) &&
          !processedMessages.get(topicId)?.has(message.sequence_number) &&
          !messagesInProcess.get(topicId)?.has(message.sequence_number)
        ) {
          await handleIncomingMessage(message, topicId);
        }
      }
    } catch (error) {
      console.error(`Error checking messages for topic ${topicId}:`, error);
    }
  }
}

/**
 * Sends a welcome message to a newly established connection
 */
async function sendWelcomeMessage(topicId: string) {
  try {
    const sendMessageTool = tools.find(t => t instanceof SendMessageTool) as SendMessageTool;
    if (sendMessageTool) {
      await sendMessageTool.invoke({
        topicId: topicId,
        message: WELCOME_MESSAGE,
        memo: 'Welcome message',
        disableMonitoring: true,
      });
      console.log(`Sent welcome message to topic ${topicId}`);
    }
  } catch (error) {
    console.error(`Error sending welcome message to topic ${topicId}:`, error);
  }
}

// --- Initialization ---
async function initialize() {
  console.log('Initializing HCS-10 LangChain Agent...');
  try {
    // --- Load Environment Variables ---
    const operatorId = process.env.HEDERA_OPERATOR_ID!;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY!;
    const network = process.env.HEDERA_NETWORK || 'testnet';
    const openaiApiKey = process.env.OPENAI_API_KEY!;
    const registryUrl = process.env.REGISTRY_URL;

    if (!operatorId || !operatorKey) {
      throw new Error(
        'HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env for initial client setup.'
      );
    }
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY must be set in .env');
    }

    // Validate and cast network type
    const hederaNetwork = network.toLowerCase();
    if (hederaNetwork !== 'mainnet' && hederaNetwork !== 'testnet') {
      throw new Error(
        `Invalid HEDERA_NETWORK: ${network}. Must be 'mainnet' or 'testnet'.`
      );
    }

    // --- Initialize HCS Client and State ---
    hcsClient = new HCS10Client(operatorId, operatorKey, hederaNetwork, {
      useEncryption: false,
      registryUrl: registryUrl,
    });

    const monitoringHcsClient = new HCS10Client(
      operatorId,
      operatorKey,
      hederaNetwork,
      {
        useEncryption: false,
        registryUrl: registryUrl,
        logLevel: 'error',
      }
    );

    // Instantiate the state class with default prefix TODD
    stateManager = new OpenConvaiState();
    console.log('State manager initialized with default prefix: TODD');

    // Explicitly initialize the ConnectionsManager with the standard client
    stateManager.initializeConnectionsManager(hcsClient.standardClient);
    console.log('ConnectionsManager initialized with current client');

    // --- Load all known agents from environment variables ---
    const knownPrefixes = (process.env.KNOWN_AGENT_PREFIXES || 'TODD')
      .split(',')
      .map((prefix) => prefix.trim())
      .filter((prefix) => prefix.length > 0);

    console.log(
      `Found ${
        knownPrefixes.length
      } known agent prefix(es): ${knownPrefixes.join(', ')}`
    );

    const loadedAgents: AgentIdentity[] = [];
    for (const prefix of knownPrefixes) {
      const agent = await loadAgentFromEnv(prefix);
      if (agent) {
        loadedAgents.push(agent);
        console.log(`Loaded agent: ${agent.name} (${agent.accountId})`);
      }
    }

    // --- Prompt user to select an agent if multiple are available ---
    if (loadedAgents.length > 0) {
      const selectedAgent = await promptUserToSelectAgent(loadedAgents);

      if (selectedAgent) {
        console.log(
          `Using agent: ${selectedAgent.name} (${selectedAgent.accountId})`
        );

        // Configure clients with selected identity
        hcsClient.setClient(selectedAgent.accountId, selectedAgent.privateKey);

        monitoringHcsClient.setClient(
          selectedAgent.accountId,
          selectedAgent.privateKey
        );

        // Update state manager
        stateManager.setCurrentAgent({
          name: selectedAgent.name,
          accountId: selectedAgent.accountId,
          inboundTopicId: selectedAgent.inboundTopicId,
          outboundTopicId: selectedAgent.outboundTopicId,
          profileTopicId: selectedAgent.profileTopicId,
        });

        // Re-initialize ConnectionsManager with updated client
        stateManager.initializeConnectionsManager(hcsClient.standardClient);
        console.log('ConnectionsManager re-initialized with selected agent');

        console.log(`Client configured to use ${selectedAgent.name}.`);
      } else {
        console.log('No agent selected. Using initial operator identity.');
      }
    } else {
      console.log(
        `No registered agents found. Using initial operator identity: ${operatorId}`
      );
    }

    console.log(
      `HCS client configured for operator ${hcsClient.getOperatorId()} on ${hederaNetwork}.`
    );

    // --- Instantiate Tools as an Array, passing stateManager ---
    tools = [
      new RegisterAgentTool(hcsClient as HCS10Client),
      new FindRegistrationsTool({ hcsClient: hcsClient as HCS10Client }),
      new InitiateConnectionTool({ hcsClient: hcsClient as HCS10Client, stateManager }),
      new ListConnectionsTool({ hcsClient: hcsClient as HCS10Client, stateManager }),
      new SendMessageToConnectionTool({
        hcsClient: hcsClient as HCS10Client,
        stateManager,
      }),
      new CheckMessagesTool({ hcsClient: hcsClient as HCS10Client, stateManager }),
      new SendMessageTool(hcsClient as HCS10Client),
      new ConnectionTool({
        client: monitoringHcsClient as HCS10Client,
        stateManager,
      }),
      new ConnectionMonitorTool({
        hcsClient: monitoringHcsClient as HCS10Client,
        stateManager,
      }),
      new ManageConnectionRequestsTool({
        hcsClient: hcsClient as HCS10Client,
        stateManager,
      }),
      new AcceptConnectionRequestTool({
        hcsClient: hcsClient as HCS10Client,
        stateManager,
      }),
      new RetrieveProfileTool(hcsClient as HCS10Client),
    ];

    connectionMonitor = tools.find(
      (tool) => tool instanceof ConnectionTool
    ) as ConnectionTool | null;

    connectionMonitorTool = tools.find(
      (tool) => tool instanceof ConnectionMonitorTool
    ) as ConnectionMonitorTool | null;

    console.log('Tools initialized.');

    // Initialize plugin system
    try {
      console.log('Initializing plugin system...');

      // Create plugin context - Use Logger instance
      pluginContext = {
        client: hcsClient,
        logger: new Logger({ module: 'PluginSystem' }),
        config: {
          weatherApiKey: process.env.WEATHER_API_KEY,
        }
      };

      // Initialize plugin registry
      pluginRegistry = new PluginRegistry(pluginContext);

      // Load and register plugins
      const weatherPlugin = new WeatherPlugin();
      const defiPlugin = new DeFiPlugin();
      const hbarPricePlugin = new HbarPricePlugin();
      const sauceSwapPlugin = new SauceSwapPlugin();

      await pluginRegistry.registerPlugin(weatherPlugin);
      await pluginRegistry.registerPlugin(defiPlugin);
      await pluginRegistry.registerPlugin(hbarPricePlugin);
      await pluginRegistry.registerPlugin(sauceSwapPlugin);

      console.log('Plugin system initialized successfully.');

      // Get plugin tools and add them to the tools array
      const pluginTools = pluginRegistry.getAllTools();
      tools = [...tools, ...pluginTools];

      console.log(`Added ${pluginTools.length} plugin tools to the agent's toolkit.`);

      if (!process.env.WEATHER_API_KEY) {
        console.log('\nNote: Weather API key not found in environment variables.');
        console.log('Weather plugin tools will not function correctly without an API key.');
        console.log('Set WEATHER_API_KEY in your .env file to use the Weather plugin.');
      }

    } catch (error) {
      console.error('Error initializing plugin system:', error);
    }

    // Initialize LangChain components
    const llm = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      modelName: 'gpt-4-turbo-preview',
      temperature: 0
    });

    memory = new ConversationTokenBufferMemory({
      llm,
      memoryKey: 'chat_history',
      returnMessages: true,
      maxTokenLimit: 4000,
      inputKey: 'input',
      outputKey: 'output'  // Specify the output key explicitly
    });

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', AGENT_PERSONALITY],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad')
    ]);

    const agent = await createOpenAIToolsAgent({
      llm,
      tools,
      prompt
    });
    console.log('LangChain agent created successfully');

    agentExecutor = new AgentExecutor({
      agent,
      tools,
      memory,
      maxIterations: 3,
      verbose: true
    });
    console.log('Agent executor initialized');

  } catch (error) {
    console.error('Error initializing HCS-10 LangChain Agent:', error);
    throw error;  // Re-throw to handle in the calling function
  }
}

async function startConsoleMode() {
  console.log('\nStarting console mode...');
  console.log('Type your messages and press Enter to send. Type "exit" to quit.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const processUserInput = async (input: string) => {
    if (input.toLowerCase() === 'exit') {
      console.log('Exiting console mode...');
      rl.close();
      process.exit(0);
    }

    try {
      if (!agentExecutor) {
        console.error('Agent executor not initialized');
        return;
      }

      const response = await agentExecutor.invoke({
        input: input
      });

      console.log('\nAgent response:', response.output);
      console.log('\nEnter your next message (or type "exit" to quit):');
    } catch (error) {
      console.error('Error processing input:', error);
    }
  };

  rl.on('line', (input) => {
    processUserInput(input);
  });
}

async function startAutomatedMode() {
  console.log('\nStarting automated HCS-10 monitoring mode...');
  
  // Initialize message tracking
  await initializeMessageTracking();
  
  // Track established connections to avoid sending welcome message multiple times
  const welcomedConnections = new Set<string>();
  
  // Start monitoring for new messages and connections
  setInterval(async () => {
    try {
      if (connectionMonitorTool) {
        const monitorResult = await connectionMonitorTool.invoke({
          acceptAll: true,
          monitorDurationSeconds: 5,
        });

        // Check for newly established connections
        const connections = stateManager
          .listConnections()
          .filter((conn) => conn.status === 'established');

        for (const conn of connections) {
          const topicId = conn.connectionTopicId;
          if (!welcomedConnections.has(topicId)) {
            await sendWelcomeMessage(topicId);
            welcomedConnections.add(topicId);
          }
        }
      }
      await checkForNewMessages();
    } catch (error) {
      console.error('Error in monitoring loop:', error);
    }
  }, 10000);
  
  console.log('Automated monitoring active. Press Ctrl+C to exit.');
}

async function promptForMode(): Promise<'console' | 'automated'> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\nPlease select operation mode:');
    console.log('1. Console mode (interactive chat)');
    console.log('2. Automated HCS-10 monitoring mode');
    
    rl.question('Enter your choice (1 or 2): ', (answer) => {
      rl.close();
      if (answer === '1') {
        resolve('console');
      } else if (answer === '2') {
        resolve('automated');
      } else {
        console.log('Invalid choice. Defaulting to automated mode.');
        resolve('automated');
      }
    });
  });
}

// --- Main Execution ---
async function main() {
  console.log('Starting initialization...');
  await initialize();
  console.log('Initialization complete');

  const mode = await promptForMode();
  
  if (mode === 'console') {
    await startConsoleMode();
  } else {
    await startAutomatedMode();
  }
}

main().catch((error) => {
  console.error('Error in main execution:', error);
});