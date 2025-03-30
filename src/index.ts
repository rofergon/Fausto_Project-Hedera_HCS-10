// src/index.ts

import { createHederaClient } from "./utils/HederaClient.js";
import { HCS10Client } from "./hcs10/HCS10Client.js";
import { RegisterAgentTool } from "./tools/RegisterAgentTool.js";
import { SendMessageTool } from "./tools/SendMessageTool.js";
import { ConnectionTool } from "./tools/ConnectionTool.js";

/**
 * Initializes the HCS10 client and returns pre-registered LangChain tools.
 *
 * @param options - Optional settings such as useEncryption flag and registryUrl.
 */
export async function initializeHCS10Client(options?: { useEncryption?: boolean, registryUrl?: string }) {
    // Assume operator details are in environment variables
    const operatorId = process.env.HEDERA_ACCOUNT_ID;
    const operatorPrivateKey = process.env.HEDERA_PRIVATE_KEY;
    const network = process.env.HEDERA_NETWORK || 'testnet'; // Default to testnet

    if (!operatorId || !operatorPrivateKey) {
        throw new Error("HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set in environment variables.");
    }

    // Instantiate HCS10Client with new constructor
    const hcs10Client = new HCS10Client(
        operatorId,
        operatorPrivateKey,
        network as 'mainnet' | 'testnet' | 'previewnet',
        {
            useEncryption: options?.useEncryption,
            registryUrl: options?.registryUrl // Pass registry URL
        }
    );

    // Create pre-registered LangChain tool instances.
    // TODO: RegisterAgentTool needs refactoring to use createAndRegisterAgent
    const registerAgentTool = new RegisterAgentTool(hcs10Client);
    const sendMessageTool = new SendMessageTool(hcs10Client);
    const connectionTool = new ConnectionTool(hcs10Client);

    return {
        hcs10Client,
        tools: {
            registerAgentTool,
            sendMessageTool,
            connectionTool
        }
    };
}

export * from "./hcs10/HCS10Client.js";
export * from "./tools/RegisterAgentTool.js";
export * from "./tools/SendMessageTool.js";
export * from "./tools/ConnectionTool.js";
