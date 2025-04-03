import * as dotenv from 'dotenv';
import readline from 'readline';

// --- HCS-10 Imports ---
import { HCS10Client, StandardNetworkType } from '../src/hcs10/HCS10Client';
// Use the actual DemoState from the src directory
import { DemoState } from '../src/demo-state';
import { CheckMessagesTool } from '../src/tools/CheckMessagesTool';
import { ConnectionTool } from '../src/tools/ConnectionTool';
import { InitiateConnectionTool } from '../src/tools/InitiateConnectionTool';
import { ListConnectionsTool } from '../src/tools/ListConnectionsTool';
import { RegisterAgentTool } from '../src/tools/RegisterAgentTool';
import { SendMessageToConnectionTool } from '../src/tools/SendMessageToConnectionTool';
import { SendMessageTool } from '../src/tools/SendMessageTool';

// --- LangChain Imports ---
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { ConversationTokenBufferMemory } from 'langchain/memory'; // Corrected import
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { BaseMessage } from '@langchain/core/messages';
import { StructuredToolInterface } from '@langchain/core/tools';

dotenv.config();

// --- Configuration ---
const AGENT_PERSONALITY = `You are a helpful assistant managing Hedera HCS-10 connections and messages.
You have access to tools for registering agents, initiating connections, listing active connections, sending messages over connections, and checking for new messages.
The current agent you are operating as is configured via environment variables (OPERATOR_ID). You cannot currently switch agents after starting.
When asked to perform an action, use the available tools. Ask for clarification if needed.
Be concise and informative in your responses. When listing connections or checking messages, present the information clearly.
Remember the connection numbers when listing connections, as users might refer to them.`;

// --- Global Variables ---
let hcsClient: HCS10Client;
let demoState: DemoState; // Instance of IMPORTED DemoState
let agentExecutor: AgentExecutor;
let memory: ConversationTokenBufferMemory;
let connectionMonitor: ConnectionTool | null = null;

// --- Initialization ---
async function initialize() {
  console.log('Initializing HCS-10 LangChain Agent...');
  try {
    // --- Load Environment Variables ---
    const operatorId = process.env.OPERATOR_ID;
    const operatorKey = process.env.OPERATOR_PRIVATE_KEY;
    const network = process.env.HEDERA_NETWORK || 'testnet';
    const registryUrl = process.env.REGISTRY_URL || 'https://moonscape.tech';
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error(
        'OPERATOR_ID and OPERATOR_PRIVATE_KEY must be set in .env for initial client setup.'
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
    const standardNetwork: StandardNetworkType = hederaNetwork;

    // --- Initialize HCS Client and State ---
    // Correct HCS10Client instantiation (no logger option)
    hcsClient = new HCS10Client(operatorId, operatorKey, standardNetwork, {
      useEncryption: false,
      registryUrl: registryUrl,
    });

    if (process.env.TODD_PRIVATE_KEY && process.env.TODD_ACCOUNT_ID) {
      hcsClient.setClient(
        process.env.TODD_ACCOUNT_ID,
        process.env.TODD_PRIVATE_KEY
      );
    }

    console.log(
      `HCS client configured for operator ${operatorId} on ${standardNetwork}.`
    );

    // Instantiate the imported DemoState
    demoState = new DemoState();

    // --- Instantiate Tools as an Array ---
    const tools: StructuredToolInterface[] = [
      new RegisterAgentTool(hcsClient),
      new InitiateConnectionTool({ hcsClient, demoState }),
      new ListConnectionsTool({ demoState }),
      new SendMessageToConnectionTool({ hcsClient, demoState }),
      new CheckMessagesTool({ hcsClient, demoState }),
      new SendMessageTool(hcsClient),
      new ConnectionTool({ client: hcsClient, demoState }),
    ];
    // Get a reference to the connection tool if needed
    connectionMonitor = tools.find(
      (tool) => tool instanceof ConnectionTool
    ) as ConnectionTool;

    console.log('Tools initialized.');

    // --- Initialize LangChain Components ---
    const llm = new ChatOpenAI({
      apiKey: openaiApiKey,
      modelName: 'gpt-4o',
      temperature: 0,
    });

    // Corrected memory instantiation
    memory = new ConversationTokenBufferMemory({
      llm: llm,
      memoryKey: 'chat_history',
      returnMessages: true,
      outputKey: 'output',
      maxTokenLimit: 1000,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', AGENT_PERSONALITY],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const agent = await createOpenAIToolsAgent({
      llm,
      tools, // Pass the array
      prompt,
    });

    agentExecutor = new AgentExecutor({
      agent,
      tools, // Pass the array
      memory,
      verbose: false,
    });

    console.log('LangChain agent initialized.');

    // --- Start Connection Monitoring ---
    if (connectionMonitor) {
      console.log('Attempting to start background connection monitoring...');
      try {
        const inboundTopicId = await hcsClient.getInboundTopicId(); // Fetch the operator's topic ID
        // Start monitoring asynchronously - don't await it
        connectionMonitor
          ._call({ inboundTopicId }) // Start the internal monitoring loop
          .then((result) =>
            console.log(`Background connection monitor status: ${result}`)
          )
          .catch((error) =>
            // Log error but don't crash the main app
            console.error(
              'Background connection monitor failed to start or encountered an error:',
              error
            )
          );
      } catch (err) {
        console.error('Could not get inbound topic ID to start monitor:', err);
        console.warn('Connection monitoring could not be started.');
      }
    } else {
      console.warn('ConnectionTool instance not found, cannot monitor.');
    }
  } catch (error) {
    console.error('Initialization failed:', error);
    process.exit(1);
  }
}

// --- Chat Loop ---
async function chatLoop() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\nAgent ready. Type your message or 'exit' to quit.");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const userInput = await new Promise<string>((resolve) => {
      rl.question('You: ', resolve);
    });

    if (userInput.toLowerCase() === 'exit') {
      console.log('Exiting chat...');
      rl.close();
      // Attempt to stop monitoring
      if (
        connectionMonitor &&
        typeof connectionMonitor.stopMonitoring === 'function'
      ) {
        console.log('Stopping connection monitor...');
        connectionMonitor.stopMonitoring();
      }
      break;
    }

    try {
      console.log('Agent thinking...');
      // Invoke the agent executor
      const result = await agentExecutor.invoke({ input: userInput });

      // Print the agent's response
      console.log(`Agent: ${result.output}`);
    } catch (error) {
      console.error('Error during agent execution:', error);
      console.log('Agent: Sorry, I encountered an error. Please try again.');
    }
  }
}

// --- Main Execution ---
async function main() {
  await initialize();
  await chatLoop();
}

main().catch((err) => {
  console.error('Unhandled error in main loop:', err);
  process.exit(1);
});

// --- HCS10Client Modification Reminder ---
/*
!!! IMPORTANT REMINDER !!!

In `src/hcs10/HCS10Client.ts`, you MUST add methods like:

public async getInboundTopicId(): Promise<string> { ... see previous message ... }
public getOperatorId(): string { ... see previous message ... }

(Implement these correctly in HCS10Client.ts before enabling connection monitoring)
*/
