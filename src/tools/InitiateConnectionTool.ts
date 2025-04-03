import { StructuredTool, ToolParams } from '@langchain/core/tools';
import { z } from 'zod';
import { HCS10Client } from '../hcs10/HCS10Client';
import { DemoState, ActiveConnection } from '../demo-state';
import { Logger } from '@hashgraphonline/standards-sdk'; // Assuming logger utility

export interface InitiateConnectionToolParams extends ToolParams {
  hcsClient: HCS10Client;
  demoState: DemoState;
}

/**
 * A tool to orchestrate the HCS-10 connection initiation process.
 * Takes a target agent's account ID, retrieves their profile, submits a connection request,
 * waits for confirmation, and updates the demo state.
 */
export class InitiateConnectionTool extends StructuredTool {
  name = 'initiate_connection';
  description =
    'Initiates an HCS-10 connection with another agent using their account ID. This involves retrieving their profile, sending a connection request, and waiting for confirmation.';
  schema = z.object({
    targetAccountId: z
      .string()
      .describe(
        'The Hedera account ID (e.g., 0.0.12345) of the agent you want to connect with.'
      ),
  });

  private hcsClient: HCS10Client;
  private demoState: DemoState;
  private logger: Logger;

  constructor({ hcsClient, demoState, ...rest }: InitiateConnectionToolParams) {
    super(rest);
    this.hcsClient = hcsClient;
    this.demoState = demoState;
    this.logger = Logger.getInstance({ module: 'InitiateConnectionTool' });
  }

  protected async _call({
    targetAccountId,
  }: z.infer<this['schema']>): Promise<string> {
    const currentAgent = this.demoState.getCurrentAgent();
    if (!currentAgent) {
      return 'Error: Cannot initiate connection. No agent is currently active. Please register or select an agent first.';
    }

    this.logger.info(
      `Attempting connection from ${currentAgent.accountId} to ${targetAccountId}`
    );

    try {
      // 1. Retrieve target agent's profile
      this.logger.debug(`Retrieving profile for ${targetAccountId}...`);
      const targetProfile = await this.hcsClient.retrieveProfile(
        targetAccountId
      );
      if (!targetProfile?.topicInfo?.inboundTopic) {
        return `Error: Could not retrieve profile or find inbound topic ID for target agent ${targetAccountId}. They might not be registered or have a public profile.`;
      }
      const targetInboundTopicId = targetProfile.topicInfo.inboundTopic;
      const targetAgentName =
        targetProfile.profile.name || `Agent ${targetAccountId}`; // Use name if available
      this.logger.debug(
        `Found target inbound topic: ${targetInboundTopicId}, Name: ${targetAgentName}`
      );

      // 2. Submit connection request
      this.logger.debug(
        `Submitting connection request to ${targetAccountId} via topic ${targetInboundTopicId}...`
      );
      const requestResult = await this.hcsClient.submitConnectionRequest(
        targetInboundTopicId,
        currentAgent.name
      );
      this.logger.debug(
        `Connection request submitted. Receipt Status: ${requestResult?.status?.toString()}`
      );

      // Get the sequence number (type Long | null) and convert to number
      let connectionRequestId: number | null = null;
      const sequenceNumberLong = requestResult?.topicSequenceNumber; // Type: Long | null

      if (sequenceNumberLong !== null) {
        // Check for null or undefined
        try {
          connectionRequestId = sequenceNumberLong.toNumber(); // Convert Long to number
          if (isNaN(connectionRequestId)) {
            this.logger.error(
              'Converted sequence number is NaN.',
              sequenceNumberLong
            );
            throw new Error(
              'Converted connection request sequence number is invalid.'
            );
          }
        } catch (conversionError) {
          this.logger.error(
            'Error converting Long sequence number to number:',
            conversionError
          );
          throw new Error(
            'Failed to convert connection request sequence number to a standard number.'
          );
        }
      } else {
        this.logger.error(
          'Connection request sequence number not found in receipt:',
          requestResult
        );
        throw new Error(
          'Connection request sequence number not found in the transaction receipt.'
        );
      }

      // Ensure we have a valid number before proceeding
      if (connectionRequestId === null) {
        // This case should theoretically be caught above, but double-check
        throw new Error('Failed to obtain a valid connection request ID.');
      }

      this.logger.debug(
        `Connection request sequence number: ${connectionRequestId}`
      );

      // 3. Wait for connection confirmation on *our* outbound topic
      this.logger.info(
        `Waiting for connection confirmation on topic ${currentAgent.outboundTopicId} for request ID ${connectionRequestId}...`
      );
      const confirmationTimeoutMs = 60000;
      const delayMs = 2000;
      const maxAttempts = Math.ceil(confirmationTimeoutMs / delayMs);

      const confirmationResult =
        await this.hcsClient.waitForConnectionConfirmation(
          currentAgent.outboundTopicId,
          connectionRequestId, // Pass the number
          maxAttempts,
          delayMs
        );

      if (!confirmationResult?.connectionTopicId) {
        // Include request ID in error message
        return `Error: Connection confirmation not received from ${targetAccountId} (for request ${connectionRequestId}) within ${
          confirmationTimeoutMs / 1000
        } seconds.`;
      }

      const connectionTopicId = confirmationResult.connectionTopicId;
      this.logger.info(
        `Connection confirmed! Connection Topic ID: ${connectionTopicId}`
      );

      // 4. Add to active connections in demo state
      const newConnection: ActiveConnection = {
        targetAccountId: targetAccountId,
        targetAgentName: targetAgentName,
        targetInboundTopicId: targetInboundTopicId, // Store for reference, though maybe not strictly needed later
        connectionTopicId: connectionTopicId,
      };
      this.demoState.addActiveConnection(newConnection);

      return `Successfully established connection with ${targetAgentName} (${targetAccountId}). Connection Topic: ${connectionTopicId}. You can now send messages using this connection.`;
    } catch (error) {
      this.logger.error(`Connection initiation failed: ${error}`);
      return `Error initiating connection with ${targetAccountId}: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
}
