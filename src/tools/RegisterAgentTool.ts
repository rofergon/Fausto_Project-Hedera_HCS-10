import { Logger } from '@hashgraphonline/standards-sdk';
import {
  ensureAgentHasEnoughHbar,
  ENV_FILE_PATH,
  updateEnvFile,
} from '../../examples/utils';
import { HCS10Client } from '../hcs10/HCS10Client';
import { AgentMetadata } from '../hcs10/types';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * RegisterAgentTool wraps the createAndRegisterAgent() function of HCS10Client.
 * It creates and registers an agent on Hedera using the HCS-10 standard SDK flow.
 * On success, returns a JSON string containing the new agent's details (including private key).
 */
export class RegisterAgentTool extends StructuredTool {
  name = 'register_agent';
  description =
    'Creates and registers the AI agent on the Hedera network. Returns JSON string with agent details (accountId, privateKey, topics) on success.';
  private client: HCS10Client;

  schema = z.object({
    name: z.string().describe('The name of the agent to register'),
    description: z
      .string()
      .optional()
      .describe('Optional description of the agent'),
    type: z
      .enum(['autonomous', 'manual'])
      .optional()
      .describe('Optional agent type (default: autonomous)'),
    model: z
      .string()
      .optional()
      .describe('Optional model identifier for the agent'),
  });

  /**
   * @param client - Instance of HCS10Client (already configured with operator/network).
   */
  constructor(client: HCS10Client) {
    super();
    this.client = client;
  }

  /**
   * Calls createAndRegisterAgent() with the provided metadata.
   * Returns a JSON string with agent details on success, or an error string.
   */
  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const metadata: AgentMetadata = {
      name: input.name,
      description: input.description,
      type: input.type,
      model: input.model,
    };

    try {
      const result = await this.client.createAndRegisterAgent(metadata);

      const accountId = result?.metadata?.accountId;
      const inboundTopicId = result?.metadata?.inboundTopicId;
      const outboundTopicId = result?.metadata?.outboundTopicId;
      const profileTopicId = result?.metadata?.profileTopicId;
      const privateKey = result?.metadata?.privateKey;

      if (privateKey && accountId && inboundTopicId && outboundTopicId) {
        await updateEnvFile(ENV_FILE_PATH, {
          TODD_ACCOUNT_ID: result?.metadata?.accountId,
          TODD_PRIVATE_KEY: result?.metadata?.privateKey,
          TODD_INBOUND_TOPIC_ID: result?.metadata?.inboundTopicId,
          TODD_OUTBOUND_TOPIC_ID: result?.metadata?.outboundTopicId,
        });
      }

      try {
        await ensureAgentHasEnoughHbar(
          Logger.getInstance({
            module: 'RegisterAgentTool',
          }),
          this.client.standardClient,
          accountId,
          input.name
        );
      } catch (error) {
        console.error('failed to auto fund agent', error);
      }

      this.client.setClient(accountId, privateKey);

      if (!accountId || !inboundTopicId || !outboundTopicId || !privateKey) {
        return `Error: Registration failed. The HCS client returned incomplete details (Missing: ${[
          !accountId && 'accountId',
          !inboundTopicId && 'inboundTopicId',
          !outboundTopicId && 'outboundTopicId',
          !privateKey && 'privateKey',
        ]
          .filter(Boolean)
          .join(', ')}).`;
      }

      const registrationDetails = {
        success: true,
        message: `Successfully registered agent '${input.name}'.`,
        name: input.name,
        accountId: accountId,
        privateKey: privateKey,
        inboundTopicId: inboundTopicId,
        outboundTopicId: outboundTopicId,
        profileTopicId: profileTopicId || 'N/A',
      };
      return JSON.stringify(registrationDetails);
    } catch (error) {
      return `Error: Failed to create/register agent "${input.name}". Reason: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
}
