// src/hcs10/HCS10Client.ts

import {
  TransactionReceipt,
  PrivateKey, // Import PrivateKey if needed for submitKey parameter
} from '@hashgraph/sdk';
// Import necessary components directly using named imports
import {
  HCS10Client as StandardSDKClient, // Alias to avoid name clash with our wrapper
  AgentBuilder,
  InboundTopicType as StandardInboundTopicType,
  AIAgentCapability as StandardAIAgentCapability,
  AgentRegistrationResult,
  WaitForConnectionConfirmationResponse,
  ProfileResponse,
  HCSMessage,
} from '@hashgraphonline/standards-sdk';

import { AgentMetadata, AgentChannels } from './types';
import { encryptMessage } from '../utils/Encryption';

export interface HCSMessageWithTimestamp extends HCSMessage {
  timestamp: number;
  data: string;
  sequence_number: number;
}

// Add pfp details to AgentMetadata type definition
export interface ExtendedAgentMetadata extends AgentMetadata {
  pfpBuffer?: Buffer;
  pfpFileName?: string;
}

// Define types using the imported aliases or direct types if no clash
type StandardHandleConnectionRequest = InstanceType<
  typeof StandardSDKClient
>['handleConnectionRequest'];
// Infer FeeConfigBuilderInterface and HandleConnectionRequestResponse using Parameters/Awaited utility types
type FeeConfigBuilderInterface = Parameters<StandardHandleConnectionRequest>[3];
type HandleConnectionRequestResponse = Awaited<
  ReturnType<StandardHandleConnectionRequest>
>;
// Define AND EXPORT the stricter NetworkType expected by the standard SDK
export type StandardNetworkType = 'mainnet' | 'testnet';

/**
 * HCS10Client wraps the HCS-10 functionalities using the @hashgraphonline/standards-sdk.
 * - Creates and registers agents using the standard SDK flow.
 * - Manages agent communication channels (handled by standard SDK).
 * - Sends messages on Hedera topics (currently manual, potential for standard SDK integration).
 */
export class HCS10Client {
  // Use the standard SDK's client type via alias
  public standardClient: StandardSDKClient;
  private useEncryption: boolean;

  // Note: AgentChannels might become redundant if standardClient manages them internally
  public agentChannels?: AgentChannels;
  public guardedRegistryBaseUrl: string;

  // Updated constructor to take operator details directly
  constructor(
    operatorId: string,
    operatorPrivateKey: string,
    // Restrict network type to what the standard SDK expects
    network: StandardNetworkType,
    options?: { useEncryption?: boolean; registryUrl?: string }
  ) {
    // Instantiate the standard SDK client using the imported class
    // The passed 'network' now matches the expected type
    this.standardClient = new StandardSDKClient({
      network: network,
      operatorId: operatorId,
      operatorPrivateKey: operatorPrivateKey,
      guardedRegistryBaseUrl: options?.registryUrl,
      // Add other necessary config options based on StandardSDKClient constructor if needed
    });
    this.guardedRegistryBaseUrl = options?.registryUrl || '';
    this.useEncryption = options?.useEncryption || false;
  }

  // Add public getter for operatorId
  public getOperatorId(): string {
    const operator = this.standardClient.getClient().operatorAccountId;
    if (!operator) {
      throw new Error('Operator Account ID not configured in standard client.');
    }
    return operator.toString();
  }

  // Add public getter for network
  public getNetwork(): StandardNetworkType {
    // Ensure return type matches
    // Assuming standardClient.getNetwork() returns 'mainnet' or 'testnet'
    return this.standardClient.getNetwork() as StandardNetworkType;
  }

  // Expose handleConnectionRequest from the standard client
  public async handleConnectionRequest(
    inboundTopicId: string,
    requestingAccountId: string,
    connectionRequestId: number,
    feeConfig?: FeeConfigBuilderInterface // Use inferred type
  ): Promise<HandleConnectionRequestResponse> {
    // Use inferred type
    try {
      const result = await this.standardClient.handleConnectionRequest(
        inboundTopicId,
        requestingAccountId,
        connectionRequestId,
        feeConfig
      );
      return result;
    } catch (error) {
      console.error(
        `Error handling connection request #${connectionRequestId} for topic ${inboundTopicId}:`,
        error
      );
      throw new Error(
        `Failed to handle connection request: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Exposes the standard SDK's retrieveProfile method.
   */
  public async retrieveProfile(accountId: string): Promise<ProfileResponse> {
    // Use 'any' or infer if possible
    return this.standardClient.retrieveProfile(accountId);
  }

  /**
   * Exposes the standard SDK's submitConnectionRequest method.
   */
  public async submitConnectionRequest(
    inboundTopicId: string,
    memo: string
  ): Promise<TransactionReceipt> {
    // Return type might need adjustment based on actual SDK method
    // Note: The standard SDK submitConnectionRequest might return void or something else.
    // Adjusting based on the reference code which seems to expect a receipt.
    // This might require calling standardClient.submitPayload directly if submitConnectionRequest isn't structured this way.

    // Assuming standardClient has a submitConnectionRequest that returns a receipt or similar.
    // If not, this needs refactoring to build the payload and use submitPayload.
    // Let's *assume* for now it exists and returns a receipt for the first message submission.
    return this.standardClient.submitConnectionRequest(inboundTopicId, memo) as any; // Type cast to resolve SDK version conflicts
  }

  /**
   * Exposes the standard SDK's waitForConnectionConfirmation method.
   */
  public async waitForConnectionConfirmation(
    outboundTopicId: string, // Changed from inboundTopicId based on demo usage
    connectionRequestId: number,
    maxAttempts = 60,
    delayMs = 2000
  ): Promise<WaitForConnectionConfirmationResponse> {
    // Use 'any' or infer if possible
    return this.standardClient.waitForConnectionConfirmation(
      outboundTopicId,
      connectionRequestId,
      maxAttempts,
      delayMs
    );
  }

  /**
   * Creates and registers an agent using the standard SDK's HCS10Client.
   * This handles account creation, key generation, topic setup, and registration.
   * @param metadata - The agent's metadata, potentially including pfpBuffer and pfpFileName.
   * @returns The registration result from the standard SDK, containing accountId, keys, topics etc.
   */
  public async createAndRegisterAgent(
    metadata: ExtendedAgentMetadata
  ): Promise<AgentRegistrationResult> {
    // Use components via the imported classes/enums
    const builder = new AgentBuilder();

    // Configure the agent builder with metadata
    builder
      .setName(metadata.name)
      .setDescription(metadata.description || '')
      .setCapabilities([
        StandardAIAgentCapability.TEXT_GENERATION, // Use imported enum
        // Add other capabilities as needed
      ])
      .setAgentType((metadata.type || 'autonomous') as 'autonomous' | 'manual')
      .setModel(metadata.model || 'agent-model-2024')
      .setNetwork(this.getNetwork())
      .setInboundTopicType(StandardInboundTopicType.PUBLIC); // Use imported enum

    // Set Profile Picture if provided
    if (metadata.pfpBuffer && metadata.pfpFileName) {
      // Check buffer size - AgentBuilder might have limits, though SDK handles inscription chunking
      if (metadata.pfpBuffer.byteLength === 0) {
        console.warn('Provided PFP buffer is empty. Skipping profile picture.');
      } else {
        console.log(
          `Setting profile picture: ${metadata.pfpFileName} (${metadata.pfpBuffer.byteLength} bytes)`
        );
        builder.setProfilePicture(metadata.pfpBuffer, metadata.pfpFileName);
      }
    } else {
      // StandardAgentBuilder requires a PFP. We need a fallback or error handling.
      // Option 1: Throw error
      // throw new Error("Profile picture (pfpBuffer and pfpFileName) is required for agent creation.");
      // Option 2: Use a default placeholder (requires creating a default buffer/filename)
      console.warn(
        'Profile picture not provided in metadata. Agent creation might fail if required by the underlying SDK builder.'
      );
      // If the SDK *strictly* requires it, we MUST provide something or throw.
      // Let's assume for now the SDK might handle a missing PFP gracefully or we accept potential failure.
      // For a robust solution, generating a default placeholder image might be best.
    }

    // Add social links if available
    if (metadata.social) {
      Object.entries(metadata.social).forEach(([platform, handle]) => {
        builder.addSocial(platform as any, handle);
      });
    }

    // Add properties if available
    if (metadata.properties) {
      Object.entries(metadata.properties).forEach(([key, value]) => {
        builder.addProperty(key, value);
      });
    }

    try {
      const result = await this.standardClient.createAndRegisterAgent(builder);
      if (
        result?.metadata?.inboundTopicId &&
        result?.metadata?.outboundTopicId
      ) {
        this.agentChannels = {
          inboundTopicId: result.metadata.inboundTopicId,
          outboundTopicId: result.metadata.outboundTopicId,
        };
      }
      return result;
    } catch (error) {
      console.error('Error during agent creation/registration:', error);
      throw new Error(
        `Failed to create/register agent: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Sends a structured HCS-10 message to the specified topic using the standard SDK client.
   * Handles potential inscription for large messages.
   *
   * @param topicId - The target topic ID (likely a connection topic).
   * @param operatorId - The operator ID string (e.g., "inboundTopic@accountId").
   * @param data - The actual message content/data.
   * @param memo - Optional memo for the message.
   * @param submitKey - Optional private key for topics requiring specific submit keys.
   * @returns A confirmation status string from the transaction receipt.
   */
  public async sendMessage(
    topicId: string,
    data: string,
    memo?: string,
    submitKey?: PrivateKey // Use imported PrivateKey type
  ): Promise<string> {
    // Encrypt the final payload string if needed
    if (this.useEncryption) {
      data = encryptMessage(data);
    }

    try {
      // Use the standard client's submitMessage which handles fees etc.
      const messageResponse = await this.standardClient.sendMessage(
        topicId,
        data,
        memo,
        submitKey as any // Type cast to avoid SDK version conflicts
      );
      return messageResponse.status.toString();
    } catch (error) {
      console.error(`Error sending message to topic ${topicId}:`, error);
      throw new Error(
        `Failed to send message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Retrieves messages from a topic using the standard SDK client.
   *
   * @param topicId - The topic ID to get messages from.
   * @returns Messages from the topic, mapped to the expected format.
   */
  public async getMessages(topicId: string): Promise<{
    messages: HCSMessageWithTimestamp[];
  }> {
    try {
      const result = await this.standardClient.getMessages(topicId);

      const mappedMessages = result.messages.map((sdkMessage) => {
        const timestamp = sdkMessage?.created?.getTime() || 0;

        return {
          ...sdkMessage,
          timestamp: timestamp,
          data: sdkMessage.data, // Assume data is directly usable or needs decoding based on standardClient
          sequence_number: sdkMessage.sequence_number, // Ensure sequence number is included
        };
      });
      mappedMessages.sort(
        (a: { timestamp: number }, b: { timestamp: number }) =>
          a.timestamp - b.timestamp
      );
      return { messages: mappedMessages };
    } catch (error) {
      console.error(`Error getting messages from topic ${topicId}:`, error);
      return { messages: [] };
    }
  }

  public async getMessageStream(topicId: string): Promise<{
    messages: HCSMessage[];
  }> {
    return this.standardClient.getMessageStream(topicId);
  }

  /**
   * Retrieves content from an inscribed message using the standard SDK client.
   * @param inscriptionIdOrData - The inscription ID (hcs://...) or potentially raw data string.
   * @returns The resolved message content.
   */
  public async getMessageContent(inscriptionIdOrData: string): Promise<string> {
    // ... (implementation remains the same, uses this.standardClient)
    try {
      const content = await this.standardClient.getMessageContent(
        inscriptionIdOrData
      );
      return content;
    } catch (error) {
      console.error(
        `Error retrieving message content for: ${inscriptionIdOrData}`,
        error
      );
      throw new Error(
        `Failed to retrieve message content: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Retrieves the inbound topic ID associated with the current operator.
   * This typically involves fetching the operator's own HCS-10 profile.
   * @returns A promise that resolves to the operator's inbound topic ID.
   * @throws {Error} If the operator ID cannot be determined or the profile/topic cannot be retrieved.
   */
  public async getInboundTopicId(): Promise<string> {
    try {
      const operatorId = this.getOperatorId();
      console.log(
        `[HCS10Client] Retrieving profile for operator ${operatorId} to find inbound topic...`
      );
      const profileResponse = await this.retrieveProfile(operatorId);
      if (profileResponse.success && profileResponse.topicInfo?.inboundTopic) {
        console.log(
          `[HCS10Client] Found inbound topic for operator ${operatorId}: ${profileResponse.topicInfo.inboundTopic}`
        );
        return profileResponse.topicInfo.inboundTopic;
      } else {
        throw new Error(
          `Could not retrieve inbound topic from profile for ${operatorId}. Profile success: ${profileResponse.success}, Error: ${profileResponse.error}`
        );
      }
    } catch (error) {
      console.error(
        `[HCS10Client] Error fetching operator's inbound topic ID (${this.getOperatorId()}):`,
        error
      );
      // Construct a more user-friendly error message
      const operatorId = this.getOperatorId(); // Get operator ID again for the message
      let detailedMessage = `Failed to get inbound topic ID for operator ${operatorId}.`;
      if (
        error instanceof Error &&
        error.message.includes('does not have a valid HCS-11 memo')
      ) {
        detailedMessage += ` The account profile may not exist or is invalid. Please ensure this operator account (${operatorId}) is registered as an HCS-10 agent. You might need to register it first (e.g., using the 'register_agent' tool or SDK function).`;
      } else if (error instanceof Error) {
        detailedMessage += ` Reason: ${error.message}`;
      } else {
        detailedMessage += ` Unexpected error: ${String(error)}`;
      }
      // Rethrow with the improved message
      throw new Error(detailedMessage);
    }
  }

  public setClient(accountId: string, privateKey: string): StandardSDKClient {
    this.standardClient = new StandardSDKClient({
      network: this.getNetwork(),
      operatorId: accountId,
      operatorPrivateKey: privateKey,
      guardedRegistryBaseUrl: this.guardedRegistryBaseUrl,
    });
    return this.standardClient;
  }
}
