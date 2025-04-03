import { HCS10Client } from '../hcs10/HCS10Client';
import { StructuredTool, ToolParams } from '@langchain/core/tools';
import { z } from 'zod';
// Import FeeConfigBuilder if needed for explicit fee handling
// import { FeeConfigBuilder } from '@hashgraphonline/standards-sdk';
import { Logger } from '@hashgraphonline/standards-sdk';
import { DemoState, ActiveConnection } from '../demo-state'; // Import DemoState and ActiveConnection

// Add demoState to params
export interface ConnectionToolParams extends ToolParams {
    client: HCS10Client;
    demoState: DemoState;
}

/**
 * ConnectionTool monitors an agent's inbound topic for connection requests
 * and automatically handles them using the HCS-10 standard SDK flow.
 */
export class ConnectionTool extends StructuredTool {
    name = 'monitor_connections';
    description = "Starts monitoring an agent's inbound topic for HCS-10 connection requests and handles them automatically.";
    private client: HCS10Client;
    private logger: Logger;
    private demoState: DemoState; // Added demoState property
    private isMonitoring: boolean = false; // Flag to prevent multiple monitors
    private monitoringTopic: string | null = null;

    // Schema requires the inbound topic ID of the agent to monitor
    schema = z.object({
        inboundTopicId: z.string().describe("The Hedera topic ID of the agent's inbound channel to monitor for connection requests.")
    });

    /**
     * @param client - Instance of HCS10Client.
     * @param demoState - Instance of DemoState for shared state management.
     */
    constructor({ client, demoState, ...rest }: ConnectionToolParams) { // Updated constructor signature
        super(rest);
        this.client = client;
        this.demoState = demoState; // Store demoState
        this.logger = Logger.getInstance({ module: 'ConnectionTool', level: 'info' });
    }

    /**
     * Initiates the connection request monitoring process in the background.
     */
    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const { inboundTopicId } = input;

        if (this.isMonitoring) {
            if (this.monitoringTopic === inboundTopicId) {
                return `Already monitoring topic ${inboundTopicId}.`;
            } else {
                return `Error: Already monitoring a different topic (${this.monitoringTopic}). Stop the current monitor first.`;
                // TODO: Add a mechanism to stop the monitor if needed.
            }
        }

        this.isMonitoring = true;
        this.monitoringTopic = inboundTopicId;
        this.logger.info(`Initiating connection request monitoring for topic ${inboundTopicId}...`);

        // Start the monitoring process asynchronously without awaiting it
        // This allows the tool call to return quickly.
        this.monitorIncomingRequests(inboundTopicId).catch(error => {
            this.logger.error(`Monitoring loop for ${inboundTopicId} encountered an unrecoverable error:`, error);
            this.isMonitoring = false; // Reset flag on loop failure
            this.monitoringTopic = null;
        });

        return `Started monitoring inbound topic ${inboundTopicId} for connection requests in the background.`;
    }

    /**
     * The core monitoring loop.
     */
    private async monitorIncomingRequests(inboundTopicId: string): Promise<void> {
        this.logger.info(`Monitoring inbound topic ${inboundTopicId}...`);

        let lastProcessedMessageSequence = 0;
        const processedRequestIds = new Set<number>(); // Track processed requests within this monitoring session

        // Main monitoring loop
        while (this.isMonitoring && this.monitoringTopic === inboundTopicId) {
            try {
                const messagesResult = await this.client.getMessages(inboundTopicId);

                const connectionRequests = messagesResult.messages.filter(msgAny => {
                    // Filter based on standard SDK HCSMessage structure
                    const msg = msgAny as any; // Cast for easier access (improve with proper typing if possible)
                    return (
                        msg.op === 'connection_request' &&
                        typeof msg.sequence_number === 'number' &&
                        msg.sequence_number > lastProcessedMessageSequence
                    );
                });

                for (const message of connectionRequests) {
                    const msg = message as any; // Cast for easier access
                    lastProcessedMessageSequence = Math.max(lastProcessedMessageSequence, msg.sequence_number);
                    const connectionRequestId = msg.sequence_number;

                    // Extract requesting account ID from the message's operator_id field (topic@account)
                    const senderOperatorId = msg.operator_id || '';
                    const requestingAccountId = senderOperatorId.split('@')[1] || null;

                    if (!requestingAccountId) {
                        this.logger.warn(`Could not determine requesting account ID from operator_id '${senderOperatorId}' for request #${connectionRequestId}. Skipping.`);
                        continue;
                    }

                    if (processedRequestIds.has(connectionRequestId)) {
                        this.logger.info(`Connection request #${connectionRequestId} already processed in this session. Skipping.`);
                        continue;
                    }

                    this.logger.info(`Processing connection request #${connectionRequestId} from account ${requestingAccountId}...`);

                    try {
                        // Handle the connection request using the HCS10Client wrapper
                        const confirmation = await this.client.handleConnectionRequest(
                            inboundTopicId,
                            requestingAccountId,
                            connectionRequestId
                        );

                        processedRequestIds.add(connectionRequestId);
                        this.logger.info(`Connection confirmed for request #${connectionRequestId}. New connection topic: ${confirmation.connectionTopicId}`);

                        // Add the new connection to DemoState
                        const newConnection: ActiveConnection = {
                            targetAccountId: requestingAccountId,
                            // Use account ID as name for now, profile lookup could be added later
                            targetAgentName: `Agent ${requestingAccountId}`,
                            // We don't easily get the target's inbound topic here, mark as N/A
                            targetInboundTopicId: 'N/A',
                            connectionTopicId: confirmation.connectionTopicId
                        };
                        this.demoState.addActiveConnection(newConnection);
                        this.logger.info(`Added new active connection to ${requestingAccountId} state.`);

                    } catch (handleError) {
                        this.logger.error(`Error handling connection request #${connectionRequestId} from ${requestingAccountId}:`, handleError);
                    }
                }
            } catch (error) {
                this.logger.error(`Error fetching or processing messages for topic ${inboundTopicId}:`, error);
                // Implement backoff or error threshold if needed
            }

            // Wait before the next poll
            await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds (adjust as needed)
        }

        this.logger.info(`Monitoring loop stopped for topic ${inboundTopicId}.`);
        this.isMonitoring = false; // Ensure flag is reset when loop exits
        this.monitoringTopic = null;
    }

    // Optional: Method to explicitly stop monitoring
    public stopMonitoring() {
        if (this.isMonitoring) {
            this.logger.info(`Stopping monitoring for topic ${this.monitoringTopic}...`);
            this.isMonitoring = false;
            this.monitoringTopic = null;
        } else {
            this.logger.info('Monitor is not currently running.');
        }
    }
}