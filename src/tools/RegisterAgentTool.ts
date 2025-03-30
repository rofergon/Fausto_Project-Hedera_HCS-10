// src/tools/RegisterAgentTool.ts

import { HCS10Client } from "../hcs10/HCS10Client.js";
import { AgentMetadata } from "../hcs10/types.js";
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * RegisterAgentTool wraps the createAndRegisterAgent() function of HCS10Client.
 * It creates and registers an agent on Hedera using the HCS-10 standard SDK flow.
 */
export class RegisterAgentTool extends StructuredTool {
    name = "register_agent";
    description = "Creates and registers the AI agent on the Hedera network following the HCS-10 standard.";
    private client: HCS10Client;

    schema = z.object({
        name: z.string().describe("The name of the agent to register"),
        description: z.string().optional().describe("Optional description of the agent"),
        type: z.enum(['autonomous', 'manual']).optional().describe("Optional agent type (default: autonomous)"),
        model: z.string().optional().describe("Optional model identifier for the agent"),
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

            const accountId = result?.metadata?.accountId || 'unknown';
            const inboundTopicId = result?.metadata?.inboundTopicId || 'unknown';
            const outboundTopicId = result?.metadata?.outboundTopicId || 'unknown';

            return `Successfully created and registered agent "${input.name}". Account: ${accountId}, Inbound Topic: ${inboundTopicId}, Outbound Topic: ${outboundTopicId}`;
        } catch (error) {
            throw new Error(`Failed to create/register agent: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
