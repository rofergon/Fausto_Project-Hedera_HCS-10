import { HCS10Client } from '../../src/hcs10/HCS10Client';
import { VectorStore } from './vector-store';
import { Logger, ConnectionsManager } from '@hashgraphonline/standards-sdk';
import {
  ConnectionTool,
  AcceptConnectionRequestTool,
  SendMessageTool,
  CheckMessagesTool,
  ConnectionMonitorTool,
} from '../../src/tools';
import { IStateManager } from '../../src/state/state-types';
import { OpenConvaiState } from '../../src/state/open-convai-state';

export interface HCSMessage {
  op?: string;
  sequence_number?: number;
  created?: Date;
  data?: string;
  operator_id?: string;
  connection_topic_id?: string;
  connection_request_id?: number;
}

export interface StandardsExpertConfig {
  /** HCS10 client configuration */
  client: HCS10Client;
  /** Account ID of the agent */
  accountId: string;
  /** Inbound topic ID for the agent */
  inboundTopicId: string;
  /** Outbound topic ID for the agent */
  outboundTopicId: string;
  /** Path to the vector store database directory */
  vectorStorePath?: string;
  /** Log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** OpenAI API key for embeddings and inference */
  openAiApiKey?: string;
  /** The model to use for generating responses */
  openAiModel?: string;
}

export interface AgentConnection {
  agentId: string;
  topicId: string;
  timestamp: Date;
  requesterOperatorId: string;
  connectionRequestId: number;
}

/**
 * StandardsExpertAgent class that implements a specialized agent for answering
 * questions about Hedera Standards
 */
export class StandardsExpertAgent {
  private logger: Logger;
  private client: HCS10Client;
  private accountId: string;
  private inboundTopicId: string;
  private outboundTopicId: string;
  private operatorId: string;
  private vectorStore: VectorStore | null = null;
  private vectorStorePath: string;
  private isRunning = false;
  private processedMessages: Map<string, Set<number>>;
  private openAiApiKey: string;
  private openAiModel: string;
  private stateManager: IStateManager;
  private connectionsManager: ConnectionsManager;

  // Tools
  private connectionTool: ConnectionTool;
  private acceptConnectionTool: AcceptConnectionRequestTool;
  private sendMessageTool: SendMessageTool;
  private checkMessagesTool: CheckMessagesTool;
  private connectionMonitorTool: ConnectionMonitorTool;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(config: StandardsExpertConfig) {
    this.logger = new Logger({
      module: 'StandardsExpertAgent',
      level: config.logLevel || 'info',
      prettyPrint: true,
    });

    this.client = config.client;
    this.accountId = config.accountId;
    this.inboundTopicId = config.inboundTopicId;
    this.outboundTopicId = config.outboundTopicId;
    this.operatorId = this.client.getAccountAndSigner().accountId;
    this.processedMessages = new Map();
    this.vectorStorePath = config.vectorStorePath || './vector-store';
    this.openAiApiKey = config.openAiApiKey || process.env.OPENAI_API_KEY || '';
    this.openAiModel = config.openAiModel || 'gpt-3.5-turbo';

    // Create a state manager for the agent
    this.stateManager = new OpenConvaiState();

    // Set the current agent in the state manager
    this.stateManager.setCurrentAgent({
      name: 'Standards Expert',
      accountId: this.accountId,
      inboundTopicId: this.inboundTopicId,
      outboundTopicId: this.outboundTopicId,
      profileTopicId: '',
      privateKey: (
        this.client.getAccountAndSigner().signer || ''
      ).toStringRaw(),
    });

    // Initialize the tools with proper parameters
    this.connectionTool = new ConnectionTool({
      client: this.client,
      stateManager: this.stateManager,
    });

    this.acceptConnectionTool = new AcceptConnectionRequestTool({
      hcsClient: this.client,
      stateManager: this.stateManager,
    });

    this.sendMessageTool = new SendMessageTool(this.client);

    this.checkMessagesTool = new CheckMessagesTool({
      hcsClient: this.client,
      stateManager: this.stateManager,
    });

    this.connectionMonitorTool = new ConnectionMonitorTool({
      hcsClient: this.client,
      stateManager: this.stateManager,
    });

    // Initialize ConnectionsManager
    this.connectionsManager = new ConnectionsManager({
      baseClient: this.client.standardClient,
    });
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Standards Expert Agent');

      // Initialize vector store if API key is available
      if (this.openAiApiKey) {
        this.vectorStore = new VectorStore({
          path: this.vectorStorePath,
          namespace: 'standards-expert',
          openAiApiKey: this.openAiApiKey,
        });

        await this.vectorStore.initialize();
        this.logger.info('Vector store initialized');
      } else {
        this.logger.warn(
          'OpenAI API key not provided, vector store will not be available'
        );
      }

      // Load existing connections from outbound topic
      await this.loadConnectionsFromOutboundTopic();

      this.logger.info('Standards Expert Agent initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize agent: ${error}`);
      throw error;
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.info('Agent is already running');
      return;
    }

    try {
      this.logger.info('Starting Standards Expert Agent');
      this.isRunning = true;

      // Start monitoring for incoming messages
      await this.startMonitoring();

      this.logger.info('Standards Expert Agent started successfully');
    } catch (error) {
      this.isRunning = false;
      this.logger.error(`Failed to start agent: ${error}`);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.info('Agent is not running');
      return;
    }

    try {
      this.logger.info('Stopping Standards Expert Agent');

      // Stop the monitoring interval if it exists
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      this.isRunning = false;
      this.logger.info('Standards Expert Agent stopped successfully');
    } catch (error) {
      this.logger.error(`Failed to stop agent: ${error}`);
      throw error;
    }
  }

  private async loadConnectionsFromOutboundTopic(): Promise<void> {
    try {
      this.logger.info('Loading existing connections from connections manager');

      // Use ConnectionsManager to get existing connections
      const existingConnections = this.connectionsManager.getAllConnections();

      if (!existingConnections.length) {
        this.logger.info('No existing connections found');
        return;
      }

      // Process existing connections and add them to state manager
      for (const connection of existingConnections) {
        if (connection.connectionTopicId && connection.targetAccountId) {
          // Add to state manager
          this.stateManager.addActiveConnection({
            targetAccountId: connection.targetAccountId,
            targetAgentName: connection.targetAgentName || `Agent ${connection.targetAccountId}`,
            targetInboundTopicId: connection.targetInboundTopicId || '',
            connectionTopicId: connection.connectionTopicId,
            profileInfo: connection.profileInfo,
            created: connection.created,
            status: 'established',
            metadata: {
              requestId: connection.inboundRequestId || connection.connectionRequestId
            }
          });

          this.logger.info(
            `Loaded existing connection with ${connection.targetAccountId} on topic ${connection.connectionTopicId}`
          );
        }
      }

      this.logger.info(
        `Loaded ${existingConnections.length} connections from connections manager`
      );
    } catch (error) {
      this.logger.warn(
        `Failed to load connections from connections manager: ${error}`
      );
    }
  }

  private async startMonitoring(): Promise<void> {
    try {
      // Set up periodic monitoring using ConnectionMonitorTool
      this.monitoringInterval = setInterval(async () => {
        if (!this.isRunning) {
          return;
        }

        try {
          // Monitor for connection requests
          const monitorResult = await this.connectionMonitorTool.invoke({
            acceptAll: true,
            monitorDurationSeconds: 5, // Short monitoring duration as we poll frequently
          });

          this.logger.debug(`Connection monitoring: ${monitorResult}`);

          // Check for new messages on active connections
          await this.checkForNewMessages();
        } catch (error) {
          this.logger.error(`Error in monitoring interval: ${error}`);
        }
      }, 10000); // Check every 10 seconds

      this.logger.info('Started monitoring for connections and messages');
    } catch (error) {
      this.logger.error(`Failed to start monitoring: ${error}`);
      throw error;
    }
  }

  private async checkForNewMessages(): Promise<void> {
    try {

      const result = await this.checkMessagesTool.invoke({
        checkPending: false,
        limit: 10,
        includeContent: true,
      });


      const messagesResult = JSON.parse(result);

      if (
        messagesResult?.messages?.length
      ) {
        for (const message of messagesResult.messages) {
          if (message.data && message.topicId) {
            await this.handleStandardMessage(
              {
                data: message.data,
                connection_topic_id: message.topicId,
                operator_id: message.operatorId,
              },
              message.topicId
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error checking for new messages: ${error}`);
    }
  }

  private async handleStandardMessage(
    message: HCSMessage,
    connectionTopicId: string
  ): Promise<void> {
    if (!message.data) {
      return;
    }

    // Skip messages from the agent itself
    if (message.operator_id && message.operator_id.includes(this.accountId)) {
      return;
    }

    // Parse message data
    let questionText = message.data;
    try {
      // Check if it's JSON
      if (this.isJson(message.data)) {
        const jsonData = JSON.parse(message.data);
        questionText = this.extractAllText(jsonData);
      }
    } catch (error) {
      this.logger.debug(`Failed to parse message as JSON: ${error}`);
      // Use the raw text as fallback
    }

    this.logger.info(`Received question: ${questionText}`);

    try {
      // Generate response
      const response = await this.generateResponse(questionText);

      // Send the response back through the connection topic
      await this.sendMessageTool.invoke({
        topicId: connectionTopicId,
        message: response,
        memo: 'Standards Expert response',
      });

      this.logger.info('Response sent successfully');
    } catch (error) {
      this.logger.error(`Error generating/sending response: ${error}`);

      // Send an error response
      await this.sendMessageTool.invoke({
        topicId: connectionTopicId,
        message: `I apologize, but I encountered an error while processing your question. Please try again or rephrase your question.`,
        memo: 'Error response',
      });
    }
  }

  private async generateResponse(question: string): Promise<string> {
    if (!this.vectorStore) {
      return 'Sorry, I cannot answer your question because my knowledge base is not available. Please make sure the OpenAI API key is configured correctly.';
    }

    try {
      // Search the vector store for relevant context
      const relevantContext = await this.vectorStore.search(question, 3);

      // Prepare context text
      let contextText = '';
      if (relevantContext.length > 0) {
        contextText = `Here is some information that might help:\n\n${relevantContext
          .map((item) => item.document)
          .join('\n\n')}`;
      }

      // Create the API request to OpenAI
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.openAiApiKey}`,
          },
          body: JSON.stringify({
            model: this.openAiModel,
            messages: [
              {
                role: 'system',
                content:
                  'You are a Hedera Standards Expert agent that answers questions about Hedera Standards SDK, HCS protocols, ' +
                  'and the Standards Agent Kit. Be concise and accurate in your answers. When possible, provide specific examples ' +
                  "or code snippets to illustrate implementation details. If you don't know the answer, say so clearly.",
              },
              {
                role: 'user',
                content: contextText
                  ? `I have a question about Hedera Standards: ${question}\n\n${contextText}`
                  : `I have a question about Hedera Standards: ${question}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 1500,
          }),
        }
      );

      const result = await response.json();

      if (result.choices && result.choices[0] && result.choices[0].message) {
        return result.choices[0].message.content.trim();
      } else {
        throw new Error('Invalid response format from OpenAI API');
      }
    } catch (error) {
      this.logger.error(`Error generating response: ${error}`);
      throw error;
    }
  }

  /**
   * Extracts account ID from operatorId
   */
  private extractAccountId(operatorId: string): string | null {
    if (!operatorId) {
      return null;
    }
    const parts = operatorId.split('@');
    return parts.length === 2 ? parts[1] : null;
  }

  /**
   * Checks if a string is valid JSON
   */
  private isJson(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Extract all text from an object
   */
  private extractAllText(obj: unknown): string {
    if (typeof obj === 'string') {
      return obj;
    }
    if (!obj || typeof obj !== 'object') {
      return '';
    }

    if (Array.isArray(obj)) {
      return obj
        .map((item) => this.extractAllText(item))
        .filter(Boolean)
        .join(' ');
    }

    // Type guard for objects with a potential text property
    const objWithText = obj as { text?: string };
    if (objWithText.text && typeof objWithText.text === 'string') {
      return objWithText.text;
    }

    return Object.values(obj as Record<string, unknown>)
      .map((value) => this.extractAllText(value))
      .filter(Boolean)
      .join(' ');
  }
}
