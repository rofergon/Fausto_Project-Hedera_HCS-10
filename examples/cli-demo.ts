// examples/cli-demo.ts

import { initializeHCS10Client } from "../src";
import { HCS10Client } from "../src/hcs10/HCS10Client";
import { ConnectionTool } from "../src/tools/ConnectionTool";
import { AgentMetadata } from "../src/hcs10/types";
import dotenv from "dotenv";
import readline from 'readline';

dotenv.config();

// --- Interfaces & State ---
interface RegisteredAgent {
    name: string;
    accountId: string;
    inboundTopicId: string;
    outboundTopicId: string;
    profileTopicId?: string;
}

let hcsClient: HCS10Client;
let connectionTool: ConnectionTool;
let currentAgent: RegisteredAgent | null = null;

// --- Readline Setup ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
};

// --- Menu Actions ---
async function registerNewAgent() {
    console.log("\n--- Register New Agent ---");
    const name = await question("Enter agent name: ");
    const description = await question("Enter agent description (optional): ");

    if (!name) {
        console.error("Agent name is required.");
        return;
    }

    const metadata: AgentMetadata = { name, description };

    try {
        console.log(`Registering agent "${name}"... this may take a moment.`);
        // Use the client directly
        const result = await hcsClient.createAndRegisterAgent(metadata);

        if (!result?.metadata?.accountId || !result?.metadata?.inboundTopicId || !result?.metadata?.outboundTopicId) {
            console.error("Registration failed. Result metadata incomplete:", result);
            return;
        }

        currentAgent = {
            name: name,
            accountId: result.metadata.accountId,
            inboundTopicId: result.metadata.inboundTopicId,
            outboundTopicId: result.metadata.outboundTopicId,
            profileTopicId: result.metadata.profileTopicId,
        };

        console.log("\nRegistration Successful!");
        console.log(`  Name: ${currentAgent.name}`);
        console.log(`  Account ID: ${currentAgent.accountId}`);
        console.log(`  Inbound Topic: ${currentAgent.inboundTopicId}`);
        console.log(`  Outbound Topic: ${currentAgent.outboundTopicId}`);
        if (currentAgent.profileTopicId) {
            console.log(`  Profile Topic: ${currentAgent.profileTopicId}`);
        }
        // TODO: Store keys/credentials securely if needed for future operations
        // console.log(`  Private Key: ${result.metadata.privateKey}`); // SECURITY RISK: Do not log private keys in production

    } catch (error) {
        console.error("\nError registering agent:", error);
    }
}

async function startMonitoring() {
    console.log("\n--- Monitor Connections ---");
    if (!currentAgent) {
        console.log("No agent registered yet. Please register an agent first.");
        return;
    }
    if (!currentAgent.inboundTopicId) {
        console.log("Registered agent data is missing the inbound topic ID.");
        return;
    }

    try {
        // Use the connection tool's internal method
        const result = await connectionTool._call({ inboundTopicId: currentAgent.inboundTopicId });
        console.log(result);
    } catch (error) {
        console.error("\nError starting connection monitor:", error);
    }
}

// --- Main Menu Loop ---
async function showMenu() {
    console.log("\n--- HCS-10 Agent Kit Demo ---");
    console.log(`Current Agent: ${currentAgent ? currentAgent.name + ' (' + currentAgent.accountId + ')' : 'None Registered'}`);
    console.log("1. Register New Agent");
    console.log("2. Monitor Connections for Current Agent");
    // Add more options later (e.g., send message)
    console.log("0. Exit");

    const choice = await question("Enter your choice: ");

    switch (choice.trim()) {
        case '1':
            await registerNewAgent();
            break;
        case '2':
            await startMonitoring();
            break;
        case '0':
            console.log("Exiting demo.");
            rl.close();
            // Explicitly stop monitoring if running
            if (connectionTool) {
                connectionTool.stopMonitoring();
            }
            return; // Stop loop
        default:
            console.log("Invalid choice. Please try again.");
            break;
    }
    // Show menu again
    await showMenu();
}

// --- Initialization and Start ---
async function main() {
    console.log("Initializing HCS10 client...");
    try {
        const initResult = await initializeHCS10Client({
            useEncryption: false,
            registryUrl: process.env.REGISTRY_URL || "https://moonscape.tech"
        });
        hcsClient = initResult.hcs10Client;
        connectionTool = initResult.tools.connectionTool; // Get the initialized tool
        console.log("Client initialized successfully.");
        await showMenu();
    } catch (error) {
        console.error("Failed to initialize HCS10 client:", error);
        rl.close();
    }
}

main(); 