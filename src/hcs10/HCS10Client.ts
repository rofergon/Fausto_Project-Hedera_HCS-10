// src/hcs10/HCS10Client.ts

import { TopicMessageSubmitTransaction, TransactionReceipt, TopicMessageQuery, TopicMessage } from "@hashgraph/sdk";
// Import standard SDK components using namespace
import * as StandardSDK from '@hashgraphonline/standards-sdk';
// Removed specific type imports, will access via namespace or inference

import { AgentMetadata, AgentChannels } from "./types"; // Keep existing types for now
import { encryptMessage } from "../utils/Encryption"; // Keep encryption util

// Define types by inferring from the standard client's method signature
// Adjust inference to use the namespace
type StandardHandleConnectionRequest = StandardSDK.HCS10Client['handleConnectionRequest'];
type FeeConfigBuilderInterface = Parameters<StandardHandleConnectionRequest>[3];
type HandleConnectionRequestResponse = Awaited<ReturnType<StandardHandleConnectionRequest>>;

/**
 * HCS10Client wraps the HCS-10 functionalities using the @hashgraphonline/standards-sdk.
 * - Creates and registers agents using the standard SDK flow.
 * - Manages agent communication channels (handled by standard SDK).
 * - Sends messages on Hedera topics (currently manual, potential for standard SDK integration).
 */
export class HCS10Client {
    // Use the standard SDK's client
    private standardClient: StandardSDK.HCS10Client; // Use namespaced type
    private useEncryption: boolean;

    // Note: AgentChannels might become redundant if standardClient manages them internally
    public agentChannels?: AgentChannels;

    // Updated constructor to take operator details directly
    constructor(
        operatorId: string,
        operatorPrivateKey: string,
        network: 'mainnet' | 'testnet' | 'previewnet',
        options?: { useEncryption?: boolean, registryUrl?: string }
    ) {
        // Instantiate the standard SDK client using the namespace
        this.standardClient = new StandardSDK.HCS10Client({ // Use namespaced constructor
            network: network,
            operatorId: operatorId,
            operatorPrivateKey: operatorPrivateKey,
            guardedRegistryBaseUrl: options?.registryUrl,
        });
        this.useEncryption = options?.useEncryption || false;
    }

    // Add public getter for operatorId
    public getOperatorId(): string {
        const operator = this.standardClient.getClient().operatorAccountId;
        if (!operator) {
            throw new Error("Operator Account ID not configured in standard client.");
        }
        return operator.toString();
    }

    // Add public getter for network
    public getNetwork(): string {
        return this.standardClient.getNetwork();
    }

    // Expose handleConnectionRequest from the standard client
    public async handleConnectionRequest(
        inboundTopicId: string,
        requestingAccountId: string,
        connectionRequestId: number,
        feeConfig?: FeeConfigBuilderInterface // Use inferred type
    ): Promise<HandleConnectionRequestResponse> { // Use inferred type
        try {
            const result = await this.standardClient.handleConnectionRequest(
                inboundTopicId,
                requestingAccountId,
                connectionRequestId,
                feeConfig
            );
            return result;
        } catch (error) {
            console.error(`Error handling connection request #${connectionRequestId} for topic ${inboundTopicId}:`, error);
            throw new Error(`Failed to handle connection request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Creates and registers an agent using the standard SDK's HCS10Client.
     * This handles account creation, key generation, topic setup, and registration.
     * @param metadata - The agent's metadata (using existing AgentMetadata type).
     * @returns The registration result from the standard SDK, containing accountId, keys, topics etc.
     */
    public async createAndRegisterAgent(metadata: AgentMetadata): Promise<any> {
        // Create a new AgentBuilder instance from the standard SDK using namespace
        const builder = new StandardSDK.AgentBuilder();

        // Configure the agent builder with metadata
        // TODO: Add more capabilities / inbound topic types / be dynamic
        builder
            .setName(metadata.name)
            .setDescription(metadata.description || '')
            .setCapabilities([
                StandardSDK.AIAgentCapability.TEXT_GENERATION // Use namespaced enum
            ])
            .setAgentType((metadata.type || 'autonomous') as 'autonomous' | 'manual')
            .setModel(metadata.model || 'agent-model-2024')
            .setNetwork(this.standardClient.getNetwork())
            .setInboundTopicType(StandardSDK.InboundTopicType.PUBLIC); // Use namespaced enum

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
            if (result?.metadata?.inboundTopicId && result?.metadata?.outboundTopicId) {
                this.agentChannels = {
                    inboundTopicId: result.metadata.inboundTopicId,
                    outboundTopicId: result.metadata.outboundTopicId,
                };
            }
            return result;
        } catch (error) {
            console.error("Error during agent creation/registration:", error);
            throw new Error(`Failed to create/register agent: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a message to the specified topic using the standard SDK client.
     *
     * @param topicId - The target topic ID.
     * @param message - The message content.
     * @returns A confirmation status string from the transaction receipt.
     */
    public async sendMessage(topicId: string, message: string): Promise<string> {
        // ... (implementation remains the same, uses this.standardClient)
        let finalMessage = message;
        if (this.useEncryption) {
            finalMessage = encryptMessage(message);
        }
        try {
            const receipt: TransactionReceipt = await this.standardClient.submitMessage(topicId, finalMessage);
            return receipt.status.toString();
        } catch (error) {
            console.error(`Error sending message to topic ${topicId}:`, error);
            throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Retrieves messages from a topic using the standard SDK client.
     *
     * @param topicId - The topic ID to get messages from.
     * @returns Messages from the topic, mapped to the expected format.
     */
    public async getMessages(topicId: string): Promise<{ messages: Array<{ timestamp: number; data: string }> }> {
        // ... (implementation remains the same, uses this.standardClient)
        try {
            const result = await this.standardClient.getMessages(topicId);
            const mappedMessages = result.messages.map(sdkMessage => {
                let timestamp = 0;
                if (sdkMessage.consensus_timestamp) {
                    const parts = sdkMessage.consensus_timestamp.split('.');
                    const seconds = parseInt(parts[0], 10);
                    const nanos = parseInt(parts[1] || '0', 10);
                    timestamp = seconds * 1000 + Math.floor(nanos / 1_000_000);
                }
                return {
                    timestamp: timestamp,
                    data: sdkMessage.data
                };
            });
            return { messages: mappedMessages };
        } catch (error) {
            console.error(`Error getting messages from topic ${topicId}:`, error);
            return { messages: [] };
        }
    }

    /**
     * Retrieves content from an inscribed message using the standard SDK client.
     * @param inscriptionIdOrData - The inscription ID (hcs://...) or potentially raw data string.
     * @returns The resolved message content.
     */
    public async getMessageContent(inscriptionIdOrData: string): Promise<string> {
        // ... (implementation remains the same, uses this.standardClient)
        try {
            const content = await this.standardClient.getMessageContent(inscriptionIdOrData);
            return content;
        } catch (error) {
            console.error(`Error retrieving message content for: ${inscriptionIdOrData}`, error);
            throw new Error(`Failed to retrieve message content: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}