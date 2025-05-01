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

*** CANDLESTICK CHART TOOL USAGE ***
To generate price charts for SauceSwap pools, use the 'get_sauceswap_chart' tool with these parameters:
- poolId (required): The numeric ID of the pool you want to chart
- timeRange (required): The time period to chart, using these formats:
  * Short periods: "1h", "4h", "12h"
  * Days: "1d", "3d", "7d"
  * Weeks: "1w", "2w"
  * Combined: "1d 6h", "2w 3d"
- inverted (optional): Set to true to invert the price calculation
- network (optional): Choose 'mainnet' or 'testnet' (defaults to mainnet)
- uploadToHedera (optional): Set to true to upload the chart to Hedera using inscribe and receive an HCS:// link
- quality (optional): Set image compression quality (1-100, default is 80, lower means smaller file size)
- sendDirectlyInChat (optional): Set to true to send the image directly to chat so it will render in OpenConvAI viewers

IMPORTANT: When using sendDirectlyInChat=true, the tool will return just the HRL link. When you get this link,
you must use the send_message tool with isHrl=true to properly send the image for rendering. This ensures
the image will display correctly in OpenConvAI. The HRL format will be either hcs://0.0.XXXXXX or hcs://1/XXXXXX where XXXXXX is the topic ID.

Example queries the tool can handle:
- "Generate a 4-hour chart for pool 1"
- "Show me the daily price chart for pool 2"
- "Create a weekly chart for pool 3"
- "Get a 1-day chart for pool 4 with inverted prices"
- "Generate a 2-week price history chart for pool 5"
- "Create a 1-day chart for pool 6 and upload it to Hedera"
- "Generate a compressed chart for pool 7 with quality 50 and upload it to Hedera"
- "Create a chart for pool 8 and send it directly to the chat"

The tool will:
1. Fetch historical price data
2. Generate a candlestick chart as a PNG file
3. Save it to the ./charts directory
4. If uploadToHedera is true, compress the image and upload it to Hedera
5. If sendDirectlyInChat is true, return only the HRL in the proper format for OpenConvAI rendering
6. Otherwise, return a detailed summary including:
   - Time range and interval used
   - Total number of candles
   - Price range (highest/lowest)
   - Volume and liquidity information
   - Location of the saved chart file
   - HCS:// link if uploaded to Hedera

When users ask about charts or price history:
1. If they don't specify a pool ID, ask them which pool they want to chart
2. If they don't specify a time range, suggest common options (4h, 1d, 1w)
3. Explain that charts are saved as PNG files and provide the file location
4. Include relevant price statistics from the generated chart

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

📈 Price Charts and History:
- Generate candlestick charts for any pool
- Flexible time ranges:
  • Hours: 1h, 4h, 12h
  • Days: 1d, 3d, 7d
  • Weeks: 1w, 2w
  • Custom combinations: "1d 6h", "2w 3d"
- View price trends, volume, and liquidity
- Charts are saved as PNG files
- Option to upload charts to Hedera for permanent storage
- Adjustable image compression to optimize file size
- Direct image rendering in OpenConvAI (ask to "send directly to chat")

To get started, you can ask me about:
- "Show me the available pools"
- "Give me details of pool #[number]"
- "Generate a 4-hour chart for pool #[number]"
- "Show me the daily price chart for pool #[number] and upload it to Hedera"
- "Create a compressed weekly chart for pool #[number] with quality 50 and upload it to Hedera"
- "Create a chart for pool #[number] and send it directly to the chat for viewing"
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
 * Sets up the maps to track processed messages and message timestamps
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

    try {
      // Initialize tracking for this topic
      processedMessages.set(topicId, new Set<number>());
      messagesInProcess.set(topicId, new Set<number>());
      
      // Set timestamp to 24 hours ago by default
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      lastProcessedTimestamps.set(topicId, oneDayAgo);
      
      // Pre-populate with messages we've already sent
      const history = await hcsClient.getMessageStream(topicId);
      const ourMessages = history.messages.filter(
        (m) => m.operator_id && m.operator_id.includes(hcsClient.getOperatorId())
      );
      
      // If we have messages, use the most recent one's timestamp
      if (ourMessages.length > 0) {
        const processedSet = processedMessages.get(topicId)!;
        
        // Mark our own messages as processed
        for (const msg of ourMessages) {
          if (msg.sequence_number !== undefined) {
            processedSet.add(msg.sequence_number);
          }
        }
        
        // Sort by timestamp descending and use most recent
        ourMessages.sort((a, b) => (b.created?.getTime() || 0) - (a.created?.getTime() || 0));
        if (ourMessages[0].created) {
          lastProcessedTimestamps.set(topicId, ourMessages[0].created.getTime());
          console.log(`Found last message timestamp: ${ourMessages[0].created.toISOString()} for topic ${topicId}`);
        }
      }
      
      console.log(`Initialized message tracking for topic ${topicId} with ${processedMessages.get(topicId)?.size || 0} pre-processed messages`);
    } catch (error) {
      console.error(`Error initializing message tracking for topic ${topicId}:`, error);
      // Still create empty tracking sets even if history fetch fails
      processedMessages.set(topicId, new Set<number>());
      messagesInProcess.set(topicId, new Set<number>());
      lastProcessedTimestamps.set(topicId, Date.now() - 24 * 60 * 60 * 1000);
    }
  }
  console.log('Message tracking system initialized');
}

/**
 * Handles processing and responding to incoming messages
 * Added safeguards and improved error handling
 */
async function handleIncomingMessage(message: HCSMessage, topicId: string) {
  // Initialize sequence number with default value
  const sequenceNumber = message.sequence_number || -1;

  try {
    if (!message.data || message.sequence_number === undefined) {
      console.log(`Skipping invalid message without data or sequence number`);
      return;
    }

    // Skip messages from self
    if (message.operator_id && message.operator_id.includes(hcsClient.getOperatorId())) {
      console.log(`Skipping own message #${sequenceNumber}`);
      return;
    }

    // Validate that topicId has the expected format (0.0.XXXXX)
    if (!topicId.match(/^0\.0\.[0-9]+$/)) {
      console.error(`Invalid conversation topic ID format: ${topicId}`);
      return;
    }

    console.log(`Processing message #${sequenceNumber} in topic ${topicId}: ${message.data.substring(0, 100)}${message.data.length > 100 ? '...' : ''}`);

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
      inProcessSet.delete(sequenceNumber);
      return;
    }

    // Process message with timeout protection
    const timeoutMs = 120000; // 2 minutes timeout (increased from 1 minute)
    const timeoutPromise = new Promise<{output: string}>((_, reject) => {
      setTimeout(() => reject(new Error('Processing timeout')), timeoutMs);
    });
    
    let response;
    try {
      // Race the agent processing against a timeout
      response = await Promise.race([
        agentExecutor.invoke({
          input: messageText,
          chat_history: [] // Initialize empty chat history for each new message
        }),
        timeoutPromise
      ]);
    } catch (processingError) {
      console.error(`Error or timeout processing message #${sequenceNumber}:`, processingError);
      throw processingError; // Rethrow to be handled in outer catch
    }

    // Extract just the output string from the response
    const outputText = typeof response.output === 'string' 
      ? response.output 
      : response.output?.output || response.output?.text || JSON.stringify(response.output);

    // Get the SendMessageTool
    const sendMessageTool = tools.find(t => t instanceof SendMessageTool) as SendMessageTool;
    if (!sendMessageTool) {
      console.error('SendMessageTool not found in tools array');
      inProcessSet.delete(sequenceNumber);
      return;
    }

    // Check if the response contains an HRL link
    const hrlRegex = /(hcs:\/\/1\/(?:0\.0\.[0-9]+|[0-9]+\.[0-9]+\.[0-9]+))/i;
    const hrlMatch = outputText.match(hrlRegex);
    
    // Special handling for HRL links (images)
    if (hrlMatch && hrlMatch[1]) {
      const hrlLink = hrlMatch[1];
      console.log(`Found HRL link in response: ${hrlLink}`);
      
      // Validate the conversation topicId (not the HRL topic)
      if (!topicId.match(/^0\.0\.[0-9]+$/)) {
        console.error(`Invalid conversation topic ID format: ${topicId} when sending HRL link`);
        // Fall back to normal response if topicId is invalid
        await sendMessageTool.invoke({
          topicId: topicId,
          message: `[Reply to #${sequenceNumber}] ${outputText}`,
          memo: `Reply to message #${sequenceNumber}`,
          disableMonitoring: true,
        });
        return;
      }
      
      console.log(`Will send HRL image ${hrlLink} to conversation topic ${topicId}`);
      
      try {
        // Step 1: Send only the HRL link for rendering
        await sendMessageTool.invoke({
          topicId: topicId,
          message: hrlLink,
          isHrl: true,
          disableMonitoring: true,
        });
        console.log(`Sent HRL image for rendering: ${hrlLink}`);
        
        // Step 2: Send a text message with any context
        // Remove the HRL link from the text to avoid duplication
        let textResponse = outputText.replace(hrlLink, "").trim();
        if (!textResponse) {
          textResponse = `Gráfico generado para el pool`;
        }
        
        await sendMessageTool.invoke({
          topicId: topicId,
          message: `[Reply to #${sequenceNumber}] ${textResponse}`,
          memo: `Additional info for chart`,
          disableMonitoring: true,
        });
        console.log(`Sent text response separately`);
      } catch (error) {
        console.error(`Error sending HRL and text messages: ${error}`);
        // If there's an error with the special handling, fall back to normal response
        await sendMessageTool.invoke({
          topicId: topicId,
          message: `[Reply to #${sequenceNumber}] ${outputText}`,
          memo: `Reply to message #${sequenceNumber}`,
          disableMonitoring: true,
        });
      }
    } else {
      // Normal message (no HRL link)
      await sendMessageTool.invoke({
        topicId: topicId,
        message: `[Reply to #${sequenceNumber}] ${outputText}`,
        memo: `Reply to message #${sequenceNumber}`,
        disableMonitoring: true,
      });
      console.log(`Sent regular response to message #${sequenceNumber}`);
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
 * Added batch processing and improved filtering
 */
async function checkForNewMessages() {
  const connections = stateManager
    .listConnections()
    .filter((conn) => conn.status === 'established');
    
  // Track how many messages we're processing in this batch
  let messagesBatchCount = 0;
  const MAX_BATCH_SIZE = 5; // Process at most 5 messages per check cycle

  for (const conn of connections) {
    // Stop processing if we've hit our batch limit
    if (messagesBatchCount >= MAX_BATCH_SIZE) {
      console.log(`Reached batch processing limit (${MAX_BATCH_SIZE}), will process remaining messages in next cycle`);
      break;
    }
    
    const topicId = conn.connectionTopicId;
    if (!topicId.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
      console.warn(`Skipping invalid topic ID format: ${topicId}`);
      continue;
    }

    try {
      // Ensure tracking structures exist for this topic
      if (!processedMessages.has(topicId)) {
        processedMessages.set(topicId, new Set<number>());
      }
      if (!messagesInProcess.has(topicId)) {
        messagesInProcess.set(topicId, new Set<number>());
      }
      if (!lastProcessedTimestamps.has(topicId)) {
        lastProcessedTimestamps.set(topicId, Date.now() - 24 * 60 * 60 * 1000);
      }
      
      // Get the last processed timestamp for this topic
      const lastTimestamp = lastProcessedTimestamps.get(topicId) || 0;

      // Get messages from the topic
      const messages = await hcsClient.getMessageStream(topicId);
      
      // Sort messages by sequence number to process in order
      const sortedMessages = [...messages.messages].sort(
        (a, b) => (a.sequence_number || 0) - (b.sequence_number || 0)
      );
      
      // Filter for new, unprocessed messages
      const newMessages = sortedMessages.filter(
        (m) =>
          m.sequence_number !== undefined && 
          m.op === 'message' &&
          m.created &&
          m.created.getTime() > lastTimestamp &&
          m.operator_id &&
          !m.operator_id.includes(hcsClient.getOperatorId()) &&
          !processedMessages.get(topicId)?.has(m.sequence_number) &&
          !messagesInProcess.get(topicId)?.has(m.sequence_number)
      );
      
      if (newMessages.length > 0) {
        console.log(`Found ${newMessages.length} new messages for topic ${topicId}`);
      }
      
      // Process messages in this connection up to the batch limit
      for (const message of newMessages) {
        if (messagesBatchCount >= MAX_BATCH_SIZE) {
          break;
        }
        
        await handleIncomingMessage(message, topicId);
        messagesBatchCount++;
      }
    } catch (error) {
      console.error(`Error checking messages for topic ${topicId}:`, error);
    }
  }
  
  if (messagesBatchCount > 0) {
    console.log(`Processed ${messagesBatchCount} messages in this batch`);
  }
}

/**
 * Sends a welcome message to a newly established connection
 * Only if there is no previous message history
 */
async function sendWelcomeMessage(topicId: string) {
  try {
    // First check if there's any message history in this topic
    const messageHistory = await hcsClient.getMessageStream(topicId);
    
    // If there are any messages in this topic, don't send welcome message
    if (messageHistory.messages && messageHistory.messages.length > 0) {
      console.log(`Skipping welcome message for topic ${topicId} - message history exists (${messageHistory.messages.length} messages)`);
      return;
    }
    
    // If we reach here, there's no message history, so send welcome message
    const sendMessageTool = tools.find(t => t instanceof SendMessageTool) as SendMessageTool;
    if (sendMessageTool) {
      await sendMessageTool.invoke({
        topicId: topicId,
        message: WELCOME_MESSAGE,
        memo: 'Welcome message',
        disableMonitoring: true,
      });
      console.log(`Sent welcome message to topic ${topicId} (no previous history)`);
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
      modelName: 'o4-mini',
      
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
      maxIterations: 4,
      verbose: false
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

/**
 * Starts automated HCS-10 monitoring mode
 * Improved with proper interval management and throttling
 */
async function startAutomatedMode() {
  console.log('\nStarting automated HCS-10 monitoring mode...');
  
  // Initialize message tracking
  await initializeMessageTracking();
  
  // Track established connections to avoid checking welcome status repeatedly
  const checkedWelcomeForConnections = new Set<string>();
  
  // Track when we last checked for messages to prevent overloading
  let lastCheckTime = Date.now();
  let isProcessing = false;
  
  // Minimum time between processing cycles (in ms)
  const MIN_CHECK_INTERVAL = 5000; // 5 seconds minimum between checks
  const CONNECTION_CHECK_INTERVAL = 10000; // 10 seconds for connection monitoring
  
  let connectionMonitorInterval: NodeJS.Timeout;
  let messageCheckInterval: NodeJS.Timeout;
  
  // Set up connection monitoring on an interval
  connectionMonitorInterval = setInterval(async () => {
    try {
      if (connectionMonitorTool) {
        const monitorResult = await connectionMonitorTool.invoke({
          acceptAll: true,
          monitorDurationSeconds: 3, // Reduced from 5 to 3 seconds
        });

        // Check for newly established connections
        const connections = stateManager
          .listConnections()
          .filter((conn) => conn.status === 'established');

        for (const conn of connections) {
          const topicId = conn.connectionTopicId;
          // Only check welcome status once per connection per session
          if (!checkedWelcomeForConnections.has(topicId)) {
            await sendWelcomeMessage(topicId);
            checkedWelcomeForConnections.add(topicId);
          }
        }
      }
    } catch (error) {
      console.error('Error in connection monitoring:', error);
    }
  }, CONNECTION_CHECK_INTERVAL);
  
  // Set up message checking on a separate interval
  messageCheckInterval = setInterval(async () => {
    // Skip if we're already processing messages or it's too soon
    if (isProcessing || (Date.now() - lastCheckTime) < MIN_CHECK_INTERVAL) {
      return;
    }
    
    try {
      isProcessing = true;
      lastCheckTime = Date.now();
      await checkForNewMessages();
    } catch (error) {
      console.error('Error checking for messages:', error);
    } finally {
      isProcessing = false;
    }
  }, 3000); // Check every 3 seconds, but actual checks are throttled by MIN_CHECK_INTERVAL
  
  console.log('Automated monitoring active. Press Ctrl+C to exit.');
  
  // Set up cleanup on process exit
  process.on('SIGINT', () => {
    console.log('\nShutting down monitoring...');
    clearInterval(connectionMonitorInterval);
    clearInterval(messageCheckInterval);
    process.exit(0);
  });
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