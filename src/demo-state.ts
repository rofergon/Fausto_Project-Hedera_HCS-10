// src/demo-state.ts

// Interfaces reused from cli-demo for consistency
export interface RegisteredAgent {
    name: string;
    accountId: string;
    inboundTopicId: string;
    outboundTopicId: string;
    profileTopicId?: string;
}

export interface ActiveConnection {
    targetAccountId: string;
    targetAgentName: string;
    targetInboundTopicId: string;
    connectionTopicId: string;
}

/**
 * Holds the shared state for the interactive demo.
 * Tools will need access to this instance to read/update state.
 */
export class DemoState {
    currentAgent: RegisteredAgent | null = null;
    activeConnections: ActiveConnection[] = [];
    // Store last processed consensus timestamp (in nanoseconds) for message polling
    connectionMessageTimestamps: { [connectionTopicId: string]: number } = {};

    // --- Agent Management ---
    setCurrentAgent(agent: RegisteredAgent | null): void {
        console.log(`[DemoState] Setting active agent: ${agent?.name ?? 'None'}`);
        this.currentAgent = agent;
        // Clear connections when agent changes
        this.activeConnections = [];
        this.connectionMessageTimestamps = {};
    }

    getCurrentAgent(): RegisteredAgent | null {
        return this.currentAgent;
    }

    // --- Connection Management ---
    addActiveConnection(connection: ActiveConnection): void {
        // Avoid duplicates
        if (!this.activeConnections.some(c => c.connectionTopicId === connection.connectionTopicId)) {
            console.log(`[DemoState] Adding active connection to ${connection.targetAgentName} (${connection.targetAccountId})`);
            this.activeConnections.push(connection);
            // Initialize timestamp - use current time as rough estimate
            this.connectionMessageTimestamps[connection.connectionTopicId] = Date.now() * 1_000_000;
        } else {
            console.log(`[DemoState] Connection to ${connection.targetAgentName} already exists.`);
        }
    }

    listConnections(): ActiveConnection[] {
        return [...this.activeConnections]; // Return a copy
    }

    getConnectionByIdentifier(identifier: string): ActiveConnection | undefined {
        const index = parseInt(identifier) - 1; // Check if it's a 1-based index
        if (!isNaN(index) && index >= 0 && index < this.activeConnections.length) {
            return this.activeConnections[index];
        }
        // Check if it's a targetAccountId or connectionTopicId
        return this.activeConnections.find(c =>
            c.targetAccountId === identifier || c.connectionTopicId === identifier
        );
    }

    // --- Message Timestamp Management ---
    getLastTimestamp(connectionTopicId: string): number {
        return this.connectionMessageTimestamps[connectionTopicId] || 0;
    }

    updateTimestamp(connectionTopicId: string, timestampNanos: number): void {
        if (timestampNanos > this.getLastTimestamp(connectionTopicId)) {
            console.log(`[DemoState] Updating timestamp for topic ${connectionTopicId} to ${timestampNanos}`);
            this.connectionMessageTimestamps[connectionTopicId] = timestampNanos;
        }
    }
}