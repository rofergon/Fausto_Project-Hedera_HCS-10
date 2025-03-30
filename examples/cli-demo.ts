// examples/cli-demo.ts

import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import { initializeHCS10Client } from "../src/index.js";
import { HCS10Client, ExtendedAgentMetadata } from "../src/hcs10/HCS10Client.js";
import { ConnectionTool } from "../src/tools/ConnectionTool.js";
import readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// --- Interfaces & State ---
interface RegisteredAgent {
    name: string;
    accountId: string;
    inboundTopicId: string;
    outboundTopicId: string;
    profileTopicId?: string;
    // Note: We don't store private keys here for security
}

interface ActiveConnection {
    targetAccountId: string;
    targetAgentName: string; // Store target agent name for display
    targetInboundTopicId: string;
    connectionTopicId: string;
}

let hcsClient: HCS10Client;
let connectionTool: ConnectionTool;
let currentAgent: RegisteredAgent | null = null;
let registeredAgents: RegisteredAgent[] = [];
let activeConnections: ActiveConnection[] = [];
let connectionMessageTimestamps: { [connectionTopicId: string]: number } = {}; // Store last processed consensus timestamp (nanos)
let isMonitoring = false; // Track monitoring status explicitly

// --- Readline Setup ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
};

// --- Helper Functions ---
function displayHeader(title: string) {
    console.log(`\n--- ${title} ---`);
}

function displayAgentInfo(agent: RegisteredAgent | null) {
    if (agent) {
        console.log(`  Name: ${agent.name}`);
        console.log(`  Account ID: ${agent.accountId}`);
        console.log(`  Inbound Topic: ${agent.inboundTopicId}`);
        console.log(`  Outbound Topic: ${agent.outboundTopicId}`);
        if (agent.profileTopicId) {
            console.log(`  Profile Topic: ${agent.profileTopicId}`);
        }
    } else {
        console.log("  No agent details available.");
    }
}

// --- Agent Actions ---
async function registerNewAgent() {
    displayHeader("Register New Agent");
    const name = await question("Enter agent name: ");
    const description = await question("Enter agent description (optional): ");
    const model = await question("Enter agent model identifier (optional, e.g., gpt-4o): ");
    const pfpPath = await question("Enter the full path to the profile picture file: ");

    if (!name) {
        console.error("Agent name is required.");
        return;
    }

    let pfpBuffer: Buffer | undefined = undefined;
    let pfpFileName: string | undefined = undefined;

    // Validate and read the profile picture file
    if (pfpPath) {
        try {
            if (!fs.existsSync(pfpPath)) {
                throw new Error(`File not found at path: ${pfpPath}`);
            }
            pfpBuffer = fs.readFileSync(pfpPath);
            pfpFileName = path.basename(pfpPath);
            console.log(`Read profile picture ${pfpFileName} (${pfpBuffer.length} bytes).`);

            if (pfpBuffer.length === 0) {
                console.warn("Warning: The selected profile picture file is empty.");
                // Decide if we should proceed or ask again
                // For now, we'll allow it but the SDK might reject it
            }
        } catch (fileError) {
            console.error(`Error reading profile picture file: ${fileError instanceof Error ? fileError.message : fileError}`);
            console.log("Proceeding without a profile picture. Agent registration might fail.");
            // Reset pfp variables if reading failed
            pfpBuffer = undefined;
            pfpFileName = undefined;
        }
    } else {
        console.log("No profile picture path provided. Agent registration might fail if required.");
    }

    // Use the extended metadata type
    const metadata: ExtendedAgentMetadata = {
        name,
        description,
        model,
        type: 'autonomous', // Defaulting to autonomous
        pfpBuffer, // Add the buffer
        pfpFileName // Add the filename
    };

    try {
        console.log(`\nRegistering agent "${name}"... this may take several minutes.`);
        // Pass the metadata object which now includes PFP details (or undefined)
        const result = await hcsClient.createAndRegisterAgent(metadata);

        if (!result?.metadata?.accountId || !result?.metadata?.inboundTopicId || !result?.metadata?.outboundTopicId) {
            console.error("Registration failed. Result metadata incomplete:", result);
            return;
        }

        const newAgent: RegisteredAgent = {
            name: name,
            accountId: result.metadata.accountId,
            inboundTopicId: result.metadata.inboundTopicId,
            outboundTopicId: result.metadata.outboundTopicId,
            profileTopicId: result.metadata.profileTopicId,
        };

        registeredAgents.push(newAgent);
        console.log("\nRegistration Successful!");
        displayAgentInfo(newAgent);

        // Automatically select the newly registered agent
        if (registeredAgents.length === 1) {
            currentAgent = newAgent;
            console.log(`\nAgent "${currentAgent.name}" automatically selected as active agent.`);
        }

    } catch (error) {
        console.error("\nError registering agent:", error);
    }
}

async function listManagedAgents() {
    displayHeader("Managed Agents (This Session)");
    if (registeredAgents.length === 0) {
        console.log("No agents have been registered in this session.");
        return;
    }
    registeredAgents.forEach((agent, index) => {
        console.log(`${index + 1}. ${agent.name} (${agent.accountId}) ${agent === currentAgent ? '[ACTIVE]' : ''}`);
    });
}

async function selectActiveAgent() {
    displayHeader("Select Active Agent");
    if (registeredAgents.length === 0) {
        console.log("No agents available to select. Register an agent first.");
        return;
    }

    await listManagedAgents();
    const choice = await question("Enter the number of the agent to activate: ");
    const index = parseInt(choice) - 1;

    if (isNaN(index) || index < 0 || index >= registeredAgents.length) {
        console.log("Invalid choice.");
        return;
    }

    currentAgent = registeredAgents[index];
    console.log(`Agent "${currentAgent.name}" selected as active.`);

    // Stop monitoring if active for the previous agent
    if (isMonitoring) {
        console.log("Stopping connection monitoring for the previous agent...");
        connectionTool.stopMonitoring();
        isMonitoring = false;
    }
    // Reset active connections when switching agents
    activeConnections = [];
    connectionMessageTimestamps = {};
    console.log("Active connections cleared for the new agent.");
}

// --- Connection Actions ---
async function startMonitoringConnections() {
    displayHeader("Monitor Incoming Connections");
    if (!currentAgent) {
        console.log("No active agent selected. Please select or register an agent first.");
        return;
    }
    if (!currentAgent.inboundTopicId) {
        console.log("Active agent data is missing the inbound topic ID.");
        return;
    }
    if (isMonitoring) {
        console.log(`Already monitoring connections for ${currentAgent.name} on topic ${currentAgent.inboundTopicId}.`);
        return;
    }

    try {
        // Use the connection tool's internal method to start monitoring
        const result = await connectionTool._call({ inboundTopicId: currentAgent.inboundTopicId });
        console.log(result);
        if (result.startsWith("Started monitoring")) {
            isMonitoring = true;
        }
    } catch (error) {
        console.error("\nError starting connection monitor:", error);
    }
}

async function stopMonitoringConnections() {
    displayHeader("Stop Monitoring Connections");
    if (!isMonitoring) {
        console.log("Connection monitoring is not currently active.");
        return;
    }
    if (!currentAgent) {
        console.log("Warning: No active agent, but monitoring was somehow active. Attempting to stop.");
    }

    try {
        connectionTool.stopMonitoring();
        isMonitoring = false;
        console.log("Connection monitoring stopped.");
    } catch (error) {
        console.error("\nError stopping connection monitor:", error);
    }
}

async function initiateConnection() {
    displayHeader("Initiate Connection");
    if (!currentAgent) {
        console.log("No active agent selected. Please select or register an agent first.");
        return;
    }

    const targetAccountId = await question("Enter the target agent's Account ID (e.g., 0.0.12345): ");
    if (!targetAccountId || !/^\d+\.\d+\.\d+$/.test(targetAccountId)) {
        console.log("Invalid Account ID format.");
        return;
    }

    if (targetAccountId === currentAgent.accountId) {
        console.log("Cannot connect to yourself.");
        return;
    }

    if (activeConnections.some(c => c.targetAccountId === targetAccountId)) {
        console.log(`Already have an active connection with ${targetAccountId}.`);
        return;
    }

    try {
        console.log(`\nAttempting to retrieve profile for ${targetAccountId}...`);
        const profileResponse = await hcsClient.retrieveProfile(targetAccountId);

        if (!profileResponse.success || !profileResponse.profile || !profileResponse.topicInfo?.inboundTopic) {
            console.error(`Failed to retrieve profile or inbound topic for ${targetAccountId}:`, profileResponse.error || "Incomplete profile data");
            return;
        }

        const targetInboundTopicId = profileResponse.topicInfo.inboundTopic;
        const targetAgentName = profileResponse.profile.name || targetAccountId; // Use name if available
        console.log(`Found target agent "${targetAgentName}" with inbound topic ${targetInboundTopicId}.`);

        console.log(`Submitting connection request to ${targetAgentName}...`);
        // The operator ID for the request should be the current agent's identity
        const operatorId = `${currentAgent.inboundTopicId}@${currentAgent.accountId}`;
        const memo = `Connection request from ${currentAgent.name}`;

        // Use the standard SDK client method directly
        const receipt = await hcsClient.submitConnectionRequest(
            targetInboundTopicId,
            currentAgent.accountId,
            operatorId,
            memo
        );

        const connectionRequestId = receipt.topicSequenceNumber?.toNumber();

        if (!connectionRequestId) {
            console.error("Connection request submitted, but failed to get the request sequence number from the receipt.", receipt);
            return;
        }

        console.log(`Connection request submitted successfully to topic ${targetInboundTopicId}. Request ID: ${connectionRequestId}.`);
        console.log(`Waiting for confirmation from ${targetAgentName} on your outbound topic (${currentAgent.outboundTopicId})...`);

        // Wait for the connection_created message on *our* outbound topic
        const confirmation = await hcsClient.waitForConnectionConfirmation(
            currentAgent.outboundTopicId,
            connectionRequestId,
            60, // attempts (e.g., 60 attempts * 5s = 5 minutes)
            5000 // delay ms
        );

        console.log("\nConnection Confirmed!");
        console.log(`  Connection Topic ID: ${confirmation.connectionTopicId}`);
        console.log(`  Confirmed By: ${confirmation.confirmedBy}`);
        console.log(`  Confirmation Sequence Number: ${confirmation.sequence_number}`);
        console.log(`  Confirmation Memo: ${confirmation.memo}`);

        // Store the connection
        const newConnection: ActiveConnection = {
            targetAccountId: targetAccountId,
            targetAgentName: targetAgentName,
            targetInboundTopicId: targetInboundTopicId,
            connectionTopicId: confirmation.connectionTopicId
        };
        activeConnections.push(newConnection);
        connectionMessageTimestamps[newConnection.connectionTopicId] = Date.now() * 1_000_000; // Initialize timestamp roughly (use consensus time if possible)

    } catch (error) {
        console.error("\nError initiating connection:", error instanceof Error ? error.message : error);
    }
}

async function listActiveConnections() {
    displayHeader("Active Connections");
    if (!currentAgent) {
        console.log("No active agent selected.");
        return;
    }
    if (activeConnections.length === 0) {
        console.log(`No active connections established for ${currentAgent.name}.`);
        return;
    }

    console.log(`Connections for ${currentAgent.name} (${currentAgent.accountId}):`);
    activeConnections.forEach((conn, index) => {
        console.log(`${index + 1}. To: ${conn.targetAgentName} (${conn.targetAccountId})`);
        console.log(`     Connection Topic: ${conn.connectionTopicId}`);
    });
}

// --- Messaging Actions ---
async function selectConnection(promptMessage: string): Promise<ActiveConnection | null> {
    if (activeConnections.length === 0) {
        console.log("No active connections available.");
        return null;
    }
    await listActiveConnections();
    const choice = await question(promptMessage);
    const index = parseInt(choice) - 1;

    if (isNaN(index) || index < 0 || index >= activeConnections.length) {
        console.log("Invalid choice.");
        return null;
    }
    return activeConnections[index];
}

async function sendMessageToConnection() {
    displayHeader("Send Message");
    if (!currentAgent) {
        console.log("No active agent selected.");
        return;
    }
    const connection = await selectConnection("Select connection to send message to: ");
    if (!connection) return;

    const messageContent = await question("Enter message content: ");
    if (!messageContent) {
        console.log("Message cannot be empty.");
        return;
    }

    try {
        console.log(`Sending message to ${connection.targetAgentName} via topic ${connection.connectionTopicId}...`);
        // Operator ID for sending message within an established connection
        const operatorId = `${currentAgent.inboundTopicId}@${currentAgent.accountId}`;

        // Use sendMessage directly from HCS10Client - arguments match the updated wrapper
        await hcsClient.sendMessage(
            connection.connectionTopicId,
            operatorId,
            messageContent,
            `Message from ${currentAgent.name}` // Optional memo
            // submitKey is omitted, assuming default operator key is sufficient
        );
        console.log("Message sent successfully.");
    } catch (error) {
        console.error("\nError sending message:", error);
    }
}

async function viewMessagesFromConnection() {
    displayHeader("View Incoming Messages");
    if (!currentAgent) {
        console.log("No active agent selected.");
        return;
    }
    const connection = await selectConnection("Select connection to view messages from: ");
    if (!connection) return;

    try {
        console.log(`Checking for new messages from ${connection.targetAgentName} on topic ${connection.connectionTopicId}...`);
        const result = await hcsClient.getMessages(connection.connectionTopicId);
        const lastProcessedTimestamp = connectionMessageTimestamps[connection.connectionTopicId] || 0;
        let newMessagesFound = false;
        let maxTimestamp = lastProcessedTimestamp;

        if (result.messages.length === 0) {
            console.log("No messages found on this connection topic yet.");
            return;
        }

        for (const msg of result.messages) {
            // Convert message timestamp (ms) to approximate nanoseconds for comparison
            const msgTimestampNanos = msg.timestamp * 1_000_000;

            if (msgTimestampNanos > lastProcessedTimestamp) {
                newMessagesFound = true;
                let content = msg.data;

                // Check if data is an inscription ID
                if (typeof content === 'string' && content.startsWith('hcs://')) {
                    console.log(`  Resolving inscribed message ${content}...`);
                    try {
                        content = await hcsClient.getMessageContent(content);
                    } catch (resolveError) {
                        console.error(`    Error resolving inscription: ${resolveError}`);
                        content = `[Error resolving inscription ${content}]`;
                    }
                }

                // Try parsing JSON, otherwise display raw content
                let displayContent = content;
                try {
                    const parsed = JSON.parse(content);
                    // Look for standard HCS-10 message structure
                    if (parsed.p === 'hcs-10' && parsed.op === 'message') {
                        const senderOpId = parsed.operator_id || 'unknown_sender';
                        displayContent = `${senderOpId}: ${parsed.data}`;
                    } else {
                        // If not standard structure, pretty-print JSON
                        displayContent = JSON.stringify(parsed, null, 2);
                    }
                } catch (e) {
                    // Not JSON, display as is
                }

                const messageDate = new Date(msg.timestamp);
                console.log(`\n[${messageDate.toLocaleString()}] (Seq: ${msg.sequence_number})`);
                console.log(`${displayContent}`);

                if (msgTimestampNanos > maxTimestamp) {
                    maxTimestamp = msgTimestampNanos;
                }
            }
        }

        if (!newMessagesFound) {
            console.log("No new messages since last check.");
        } else {
            // Update the timestamp for this connection
            connectionMessageTimestamps[connection.connectionTopicId] = maxTimestamp;
        }

    } catch (error) {
        console.error("\nError fetching messages:", error);
    }
}


// --- Main Menu Loop ---
async function showMenu() {
    console.log("\n============ HCS-10 CLI Demo ============");
    console.log(`Active Agent: ${currentAgent ? currentAgent.name + ' (' + currentAgent.accountId + ')' : 'None Selected'}`);
    console.log(`Monitoring Status: ${isMonitoring ? 'ACTIVE' : 'INACTIVE'}`);
    console.log("-----------------------------------------");
    console.log("Agent Management:");
    console.log("  1. Register New Agent");
    console.log("  2. List Managed Agents (This Session)");
    console.log("  3. Select Active Agent");
    console.log("-----------------------------------------");
    console.log("Connection Management:");
    console.log("  4. Start Monitoring Incoming Connections (for Active Agent)");
    console.log("  5. Stop Monitoring Incoming Connections");
    console.log("  6. Initiate Connection to Another Agent");
    console.log("  7. List Active Connections (for Active Agent)");
    console.log("-----------------------------------------");
    console.log("Messaging:");
    console.log("  8. Send Message to Active Connection");
    console.log("  9. View Incoming Messages from Active Connection");
    console.log("-----------------------------------------");
    console.log("  0. Exit");
    console.log("=========================================");

    const choice = await question("Enter your choice: ");

    switch (choice.trim()) {
        case '1': await registerNewAgent(); break;
        case '2': await listManagedAgents(); break;
        case '3': await selectActiveAgent(); break;
        case '4': await startMonitoringConnections(); break;
        case '5': await stopMonitoringConnections(); break;
        case '6': await initiateConnection(); break;
        case '7': await listActiveConnections(); break;
        case '8': await sendMessageToConnection(); break;
        case '9': await viewMessagesFromConnection(); break;
        case '0':
            console.log("Exiting demo...");
            if (isMonitoring) {
                console.log("Stopping connection monitoring...");
                connectionTool.stopMonitoring();
            }
            rl.close();
            return; // Stop loop
        default:
            console.log("Invalid choice. Please try again.");
            break;
    }
    // Show menu again unless exiting
    await showMenu();
}

// --- Initialization and Start ---
async function main() {
    console.log("Initializing HCS10 client...");
    try {
        const initResult = await initializeHCS10Client({
            useEncryption: false, // Keep encryption off for simplicity in demo
            registryUrl: process.env.REGISTRY_URL || "https://moonscape.tech"
        });
        hcsClient = initResult.hcs10Client;
        connectionTool = initResult.tools.connectionTool;
        console.log("Client initialized successfully.");
        await showMenu();
    } catch (error) {
        console.error("Failed to initialize HCS10 client:", error);
        rl.close();
    }
}

main(); 