import { HCS10Client } from '../hcs10/HCS10Client';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { Logger } from '@hashgraphonline/standards-sdk';

/**
 * SendMessageTool wraps the sendMessage() function of HCS10Client.
 * It sends a message to a specified Hedera topic and monitors for responses.
 */
export class SendMessageTool extends StructuredTool {
  name = 'send_message';
  description = 'Send a message to a topic';
  private client: HCS10Client;
  private lastProcessedTimestamp: number = 0;
  private logger: Logger;

  schema = z.object({
    topicId: z.string().describe('The topic ID to send the message to'),
    message: z.string().describe('The message to send'),
    memo: z.string().optional().describe('An optional memo for the message'),
    disableMonitoring: z.boolean().optional().describe('Disable message monitoring for this message'),
    isHrl: z.boolean().optional().describe('If true, the message is treated as an HRL and will be sent as a raw HCS-10 message')
  });

  /**
   * @param client - Instance of HCS10Client.
   */
  constructor(client: HCS10Client) {
    super();
    this.client = client;
    this.logger = new Logger({ module: 'SendMessageTool' });
  }

  /**
   * Calls sendMessage() with the provided parameters.
   */
  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      // Check if this is an HRL message for OpenConvAI rendering
      if (input.isHrl === true && input.message.startsWith('hcs://')) {
        // For OpenConvAI to render images properly:
        // 1. Send just the HRL as the message
        const result = await this.client.sendMessage(
          input.topicId,
          input.message,  // Only the HRL as the message
          input.memo || "Image from SauceSwap chart"
        );

        // 2. Then optionally send the descriptive text in a separate message
        if (input.memo) {
          await this.client.sendMessage(
            input.topicId,
            input.memo,
            "Additional details"
          );
        }
        
        return `HRL image sent successfully. The image will render in OpenConvAI viewers.`;
      }
      
      // Standard message handling
      const result = await this.client.sendMessage(
        input.topicId,
        input.message,
        input.memo
      );
      
      if (result) {
        return `Message sent with sequence number ${result}`;
      } else {
        return 'Message sent';
      }
    } catch (error) {
      return `Error sending message: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async monitorResponses(
    topicId: string,
    sequenceNumber: number
  ): Promise<string | null> {
    const maxAttempts = 10;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const messages = await this.client.getMessageStream(topicId);

        for (const message of messages.messages) {
          if (
            message.created &&
            message.created.getTime() > this.lastProcessedTimestamp
          ) {
            this.lastProcessedTimestamp = message.created.getTime();

            const content = await this.client.getMessageContent(message.data);

            let parsedContent;
            try {
              parsedContent = JSON.parse(content);
            } catch (error) {
              this.logger.error(`Error parsing message content: ${error}`);
              continue;
            }
            if (message.sequence_number > sequenceNumber) {
              // Unwrap nested data field if present
              if (parsedContent && typeof parsedContent.data === 'string') {
                return parsedContent.data;
              }
              return JSON.stringify(parsedContent);
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error monitoring responses: ${error}`);
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return null;
  }
}
