import { StructuredTool, ToolParams } from '@langchain/core/tools';
import { z } from 'zod';
import { DemoState } from '../demo-state';

export interface ListConnectionsToolParams extends ToolParams {
    demoState: DemoState;
}

/**
 * A tool to list currently active HCS-10 connections stored in the DemoState.
 */
export class ListConnectionsTool extends StructuredTool {
    name = 'list_connections';
    description = 'Lists the currently active HCS-10 connections. Provides details like target agent name, target account ID, and the connection topic ID for each connection.';
    schema = z.object({}); // No input parameters needed

    private demoState: DemoState;

    constructor({ demoState, ...rest }: ListConnectionsToolParams) {
        super(rest);
        this.demoState = demoState;
    }

    protected async _call(_: z.infer<this['schema']>): Promise<string> {
        const connections = this.demoState.listConnections();

        if (connections.length === 0) {
            return 'There are currently no active connections.';
        }

        let output = 'Active Connections:\n';
        connections.forEach((conn, index) => {
            output += `${index + 1}. To: ${conn.targetAgentName} (${conn.targetAccountId}) | Connection Topic: ${conn.connectionTopicId}\n`;
        });

        return output.trim();
    }
}