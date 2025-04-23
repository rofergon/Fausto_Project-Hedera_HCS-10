import { updateEnvFile } from '../utils/state-tools';
import {
  RegisteredAgent,
  ActiveConnection,
  ConnectionRequestInfo,
  IStateManager,
  AgentPersistenceOptions,
  EnvFilePersistenceOptions,
} from './state-types';

/**
 * Implementation of the IStateManager interface for the OpenConvai system.
 * Manages agent state and connection information with thread safety and
 * proper timestamp tracking.
 */
export class OpenConvaiState implements IStateManager {
  private currentAgent: RegisteredAgent | null = null;
  private activeConnections: ActiveConnection[] = [];
  private connectionMessageTimestamps: Record<string, number> = {};
  private connectionRequests: Map<number, ConnectionRequestInfo> = new Map();
  private defaultEnvFilePath?: string;
  private defaultPrefix: string;

  /**
   * Creates a new OpenConvaiState instance
   * @param options - Options for environment variable persistence
   */
  constructor(options?: {
    defaultEnvFilePath?: string;
    defaultPrefix?: string;
  }) {
    this.defaultEnvFilePath = options?.defaultEnvFilePath;
    this.defaultPrefix = options?.defaultPrefix ?? 'TODD';
  }

  /**
   * Sets the current active agent and clears any previous connection data.
   * This should be called when switching between agents.
   */
  setCurrentAgent(agent: RegisteredAgent | null): void {
    this.currentAgent = agent;
    this.activeConnections = [];
    this.connectionMessageTimestamps = {};
    this.connectionRequests.clear();
  }

  /**
   * Returns the currently active agent or null if none is set.
   */
  getCurrentAgent(): RegisteredAgent | null {
    return this.currentAgent;
  }

  /**
   * Adds a new connection to the active connections list.
   * Ensures no duplicates are added based on connectionTopicId.
   * Initializes timestamp tracking for the connection.
   */
  addActiveConnection(connection: ActiveConnection): void {
    if (this.findConnectionIndex(connection.connectionTopicId) !== -1) {
      return;
    }

    this.activeConnections.push({ ...connection });

    this.initializeTimestampIfNeeded(connection.connectionTopicId);
  }

  /**
   * Updates an existing connection or adds it if not found.
   * Preserves existing properties when updating by merging objects.
   */
  updateOrAddConnection(connection: ActiveConnection): void {
    const index = this.findConnectionIndex(connection.connectionTopicId);

    if (index !== -1) {
      this.activeConnections[index] = {
        ...this.activeConnections[index],
        ...connection,
      };
    } else {
      this.addActiveConnection(connection);
    }

    this.initializeTimestampIfNeeded(connection.connectionTopicId);
  }

  /**
   * Returns a copy of all active connections.
   */
  listConnections(): ActiveConnection[] {
    return [...this.activeConnections];
  }

  /**
   * Finds a connection by its identifier, which can be:
   * - A 1-based index as displayed in the connection list
   * - A target account ID string
   * - A connection topic ID string
   */
  getConnectionByIdentifier(identifier: string): ActiveConnection | undefined {
    const numericIndex = parseInt(identifier) - 1;
    if (
      !isNaN(numericIndex) &&
      numericIndex >= 0 &&
      numericIndex < this.activeConnections.length
    ) {
      return this.activeConnections[numericIndex];
    }

    return this.activeConnections.find(
      (conn) =>
        conn.targetAccountId === identifier ||
        conn.connectionTopicId === identifier
    );
  }

  /**
   * Gets the last processed message timestamp for a connection.
   * Returns 0 if no timestamp has been recorded.
   */
  getLastTimestamp(connectionTopicId: string): number {
    return this.connectionMessageTimestamps[connectionTopicId] || 0;
  }

  /**
   * Updates the last processed message timestamp for a connection,
   * but only if the new timestamp is more recent than the existing one.
   */
  updateTimestamp(connectionTopicId: string, timestampNanos: number): void {
    if (connectionTopicId in this.connectionMessageTimestamps) {
      const currentTimestamp =
        this.connectionMessageTimestamps[connectionTopicId];
      if (timestampNanos > currentTimestamp) {
        this.connectionMessageTimestamps[connectionTopicId] = timestampNanos;
      }
    }
  }

  /**
   * Helper method to find a connection's index by its topic ID.
   * Returns -1 if not found.
   */
  private findConnectionIndex(connectionTopicId: string): number {
    return this.activeConnections.findIndex(
      (conn) => conn.connectionTopicId === connectionTopicId
    );
  }

  /**
   * Helper method to initialize timestamp tracking for a connection
   * if it doesn't already exist.
   */
  private initializeTimestampIfNeeded(connectionTopicId: string): void {
    if (!(connectionTopicId in this.connectionMessageTimestamps)) {
      this.connectionMessageTimestamps[connectionTopicId] =
        Date.now() * 1_000_000;
    }
  }

  addConnectionRequest(request: ConnectionRequestInfo): void {
    this.connectionRequests.set(request.id, { ...request });
  }

  listConnectionRequests(): ConnectionRequestInfo[] {
    return Array.from(this.connectionRequests.values());
  }

  getConnectionRequestById(
    requestId: number
  ): ConnectionRequestInfo | undefined {
    return this.connectionRequests.get(requestId);
  }

  removeConnectionRequest(requestId: number): void {
    this.connectionRequests.delete(requestId);
  }

  clearConnectionRequests(): void {
    this.connectionRequests.clear();
  }

  /**
   * Persists agent data to environment variables
   * @param agent - The agent data to persist
   * @param options - Environment file persistence options
   */
  async persistAgentData(
    agent: RegisteredAgent,
    options?: AgentPersistenceOptions
  ): Promise<void> {
    if (options?.type && options.type !== 'env-file') {
      throw new Error(
        `Unsupported persistence type: ${options.type}. Only 'env-file' is supported.`
      );
    }

    const envFilePath =
      (options as EnvFilePersistenceOptions)?.envFilePath ||
      this.defaultEnvFilePath ||
      process.env.ENV_FILE_PATH ||
      '.env';

    if (!envFilePath) {
      throw new Error(
        'Environment file path could not be determined for agent data persistence'
      );
    }

    const prefix =
      (options as EnvFilePersistenceOptions)?.prefix || this.defaultPrefix;

    if (!agent.accountId || !agent.inboundTopicId || !agent.outboundTopicId) {
      throw new Error('Agent data incomplete, cannot persist to environment');
    }

    const updates: Record<string, string> = {
      [`${prefix}_ACCOUNT_ID`]: agent.accountId,
      [`${prefix}_INBOUND_TOPIC_ID`]: agent.inboundTopicId,
      [`${prefix}_OUTBOUND_TOPIC_ID`]: agent.outboundTopicId,
    };

    if (agent.privateKey) {
      updates[`${prefix}_PRIVATE_KEY`] = agent.privateKey;
    }

    if (agent.profileTopicId) {
      updates[`${prefix}_PROFILE_TOPIC_ID`] = agent.profileTopicId;
    }

    await updateEnvFile(envFilePath, updates);
  }
}
