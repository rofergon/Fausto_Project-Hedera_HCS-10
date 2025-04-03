// src/tools/send-message-to-connection-tool.ts

import { StructuredTool, ToolParams } from '@langchain/core/tools';
import { z } from 'zod';
import { HCS10Client } from '../hcs10/HCS10Client';
import { DemoState } from '../demo-state';
import { Logger } from '../utils/logger'; // Assuming logger utility

export interface SendMessageToConnectionToolParams extends ToolParams {
  hcsClient: HCS10Client;
  demoState: DemoState;
}

/**
 * A tool to send a message to an agent over an established HCS-10 connection.
 */
export class SendMessageToConnectionTool extends StructuredTool {
  name = 'send_message_to_connection';
  description =
    "Sends a text message to another agent using an existing active connection. Identify the target agent using their account ID (e.g., 0.0.12345) or the connection number shown in 'list_connections'.";
  schema = z.object({
    targetIdentifier: z
      .string()
      .describe(
        "The account ID (e.g., 0.0.12345) of the target agent OR the connection number (e.g., '1', '2') from the 'list_connections' tool."
      ),
    message: z.string().describe('The text message content to send.'),
  });

  private hcsClient: HCS10Client;
  private demoState: DemoState;
  private logger: Logger;

  constructor({
    hcsClient,
    demoState,
    ...rest
  }: SendMessageToConnectionToolParams) {
    super(rest);
    this.hcsClient = hcsClient;
    this.demoState = demoState;
    this.logger = Logger.getInstance({ module: 'SendMessageToConnectionTool' });
  }

  protected async _call({
    targetIdentifier,
    message,
  }: z.infer<this['schema']>): Promise<string> {
    const currentAgent = this.demoState.getCurrentAgent();
    if (!currentAgent) {
      return 'Error: Cannot send message. No agent is currently active. Please register or select an agent first.';
    }

    const connection =
      this.demoState.getConnectionByIdentifier(targetIdentifier);
    if (!connection) {
      return `Error: Could not find an active connection matching identifier "${targetIdentifier}". Use 'list_connections' to see active connections.`;
    }

    const connectionTopicId = connection.connectionTopicId;
    const targetAgentName = connection.targetAgentName;

    // Construct the sender's operator ID
    const operatorId = `${currentAgent.inboundTopicId}@${currentAgent.accountId}`;

    this.logger.info(
      `Sending message from ${operatorId} to ${targetAgentName} (${connection.targetAccountId}) via connection topic ${connectionTopicId}`
    );

    try {
      // Call sendMessage with correct arguments
      const statusString = await this.hcsClient.sendMessage(
        connectionTopicId,
        message, // Message content as 'data'
        `Agent message from ${currentAgent.name}` // Optional memo
      );

      this.logger.debug(`Message sent. Status: ${statusString}`);

      // Return message based on the status string
      return `Message sent to ${targetAgentName} (${connection.targetAccountId}) via connection ${connectionTopicId}. Status: ${statusString}`;
    } catch (error) {
      this.logger.error(
        `Failed to send message via connection ${connectionTopicId}: ${error}`
      );
      return `Error sending message to ${targetAgentName}: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
}
