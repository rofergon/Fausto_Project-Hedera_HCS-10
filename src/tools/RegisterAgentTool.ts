import { AIAgentCapability, Logger, FeeConfigBuilder, InboundTopicType } from '@hashgraphonline/standards-sdk';
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
    'Creates and registers the AI agent on the Hedera network. Returns JSON string with agent details (accountId, privateKey, topics) on success. Optionally supports fee configuration for the agent\'s inbound topic using HBAR or specific tokens.';
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
    capabilities: z
      .array(z.number())
      .optional()
      .describe('Optional array of AIAgentCapability enum values (0-18). If not provided, defaults to just TEXT_GENERATION (0)'),
    feeCollectorAccountId: z
      .string()
      .optional()
      .describe('The account ID to collect fees. If not specified, the new agent\'s account ID will be used. Required if any fee is specified.'),
    hbarFee: z
      .number()
      .optional()
      .describe(
        'Optional: The fee amount in HBAR to charge per message on the inbound topic (e.g., 0.5). If specified, inboundTopicType will be set to FEE_BASED.'
      ),
    tokenFee: z
      .object({
        amount: z.number(),
        tokenId: z.string(),
      })
      .optional()
      .describe(
        'Optional: The fee amount and token ID to charge per message on the inbound topic (e.g., { amount: 10, tokenId: "0.0.12345" }). If specified, inboundTopicType will be set to FEE_BASED.'
      ),
    exemptAccountIds: z
      .array(z.string())
      .optional()
      .describe('Optional: Array of account IDs to exempt from ALL fees set for this agent.'),
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
      capabilities: input.capabilities || [AIAgentCapability.TEXT_GENERATION],
    };

    if (!metadata.properties) {
      metadata.properties = {};
    }

    if ((input.hbarFee && input.hbarFee > 0) ||
        (input.tokenFee && input.tokenFee.amount > 0 && input.tokenFee.tokenId)) {
      metadata.properties.inboundTopicType = InboundTopicType.FEE_BASED;
      
      const { accountId: operatorAccountId } = this.client.getAccountAndSigner();
      const collectorId = input.feeCollectorAccountId || operatorAccountId;
      
      if (!collectorId) {
        return 'Error: Fee collector account ID is required when specifying fees and could not be determined.';
      }
      
      const builder = new FeeConfigBuilder({
        network: this.client.getNetwork(),
        logger: Logger.getInstance()
      }) as any;
      
      if (collectorId) {
        builder.setFeeCollector(collectorId);
      }

      if (input.exemptAccountIds && input.exemptAccountIds.length > 0) {
        builder.addExemptAccounts(input.exemptAccountIds);
      }
      
      if (input.hbarFee && input.hbarFee > 0) {
        if (typeof builder.addHbarFee === 'function') {
          builder.addHbarFee(input.hbarFee, collectorId);
          Logger.getInstance().info(
            `Adding HBAR fee: ${input.hbarFee} HBAR to be collected by ${collectorId}`
          );
        } else {
          Logger.getInstance().warn('FeeConfigBuilder.addHbarFee method not available');
        }
      }
      
      if (input.tokenFee && input.tokenFee.amount > 0 && input.tokenFee.tokenId) {
        if (typeof builder.addTokenFee === 'function') {
          try {
            await builder.addTokenFee(input.tokenFee.amount, input.tokenFee.tokenId, collectorId);
            Logger.getInstance().info(
              `Adding token fee: ${input.tokenFee.amount} of token ${input.tokenFee.tokenId} to be collected by ${collectorId}`
            );
          } catch (error) {
            Logger.getInstance().error(`Error adding token fee: ${error}`);
          }
        } else {
          Logger.getInstance().warn('FeeConfigBuilder.addTokenFee method not available');
        }
      }
      
      metadata.properties.feeConfig = builder.build();
    }

    try {
      const result = await this.client.createAndRegisterAgent(metadata);

      const newAgentAccountId = result?.metadata?.accountId;
      const inboundTopicId = result?.metadata?.inboundTopicId;
      const outboundTopicId = result?.metadata?.outboundTopicId;
      const profileTopicId = result?.metadata?.profileTopicId;
      const privateKey = result?.metadata?.privateKey;

      if (privateKey && newAgentAccountId && inboundTopicId && outboundTopicId) {
        await updateEnvFile(ENV_FILE_PATH, {
          TODD_ACCOUNT_ID: newAgentAccountId,
          TODD_PRIVATE_KEY: privateKey,
          TODD_INBOUND_TOPIC_ID: inboundTopicId,
          TODD_OUTBOUND_TOPIC_ID: outboundTopicId,
        });
      }

      try {
        await ensureAgentHasEnoughHbar(
          Logger.getInstance({
            module: 'RegisterAgentTool',
          }),
          this.client.standardClient,
          newAgentAccountId,
          input.name
        );
      } catch (error) {
        console.error('failed to auto fund agent', error);
      }

      if (!newAgentAccountId || !inboundTopicId || !outboundTopicId || !privateKey) {
        return `Error: Registration failed. The HCS client returned incomplete details (Missing: ${[
          !newAgentAccountId && 'accountId',
          !inboundTopicId && 'inboundTopicId',
          !outboundTopicId && 'outboundTopicId',
          !privateKey && 'privateKey',
        ]
          .filter(Boolean)
          .join(', ')}).`;
      }

      let feeDescription = '';
      if (input.hbarFee && input.hbarFee > 0) {
        feeDescription += `${input.hbarFee} HBAR`;
      }
      if (input.tokenFee && input.tokenFee.amount > 0 && input.tokenFee.tokenId) {
        feeDescription += feeDescription ? ' and ' : '';
        feeDescription += `${input.tokenFee.amount} of token ${input.tokenFee.tokenId}`;
      }
      
      const feeMessage = feeDescription ? ` with ${feeDescription} fee on inbound topic` : '';

      const registrationDetails = {
        success: true,
        message: `Successfully registered agent '${input.name}'${feeMessage}.`,
        name: input.name,
        accountId: newAgentAccountId,
        privateKey: privateKey,
        inboundTopicId: inboundTopicId,
        outboundTopicId: outboundTopicId,
        profileTopicId: profileTopicId || 'N/A',
        capabilities: metadata.capabilities,
        hasFees: !!(input.hbarFee || (input.tokenFee && input.tokenFee.amount > 0 && input.tokenFee.tokenId)),
        hbarFee: input.hbarFee || 0,
        tokenFee: input.tokenFee || null
      };
      return JSON.stringify(registrationDetails);
    } catch (error) {
      return `Error: Failed to create/register agent "${input.name}". Reason: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
}
