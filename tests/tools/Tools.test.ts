// tests/tools/Tools.test.ts

import * as dotenv from "dotenv";
dotenv.config();
import { RegisterAgentTool } from "../../src/tools/RegisterAgentTool.js";
import { SendMessageTool } from "../../src/tools/SendMessageTool.js";
import { HCS10Client } from "../../src/hcs10/HCS10Client.js";
import { z } from "zod";

describe("LangChain Tools", () => {
    let mockHCS10Client: HCS10Client;

    beforeEach(() => {
        // Setup mock HCS10Client
        // Use the actual constructor signature for type safety, then mock methods
        mockHCS10Client = new HCS10Client("dummyOpId", "dummyPKey", "testnet");
        // Mock necessary methods used by the tools
        mockHCS10Client.createAndRegisterAgent = jest.fn().mockResolvedValue({ metadata: { accountId: '1', inboundTopicId: '2', outboundTopicId: '3' } });
        mockHCS10Client.sendMessage = jest.fn().mockResolvedValue("SUCCESS");
        mockHCS10Client.getMessages = jest.fn().mockResolvedValue({ messages: [] }); // Mock response for monitorResponses
        mockHCS10Client.getMessageContent = jest.fn().mockResolvedValue("Resolved Content");
    });

    describe("RegisterAgentTool", () => {
        it("should register an agent successfully", async () => {
            const tool = new RegisterAgentTool(mockHCS10Client);
            const input = { name: "Test Agent", description: "A test agent" };
            const result = await tool._call(input);
            expect(result).toContain("Successfully created and registered agent");
            expect(mockHCS10Client.createAndRegisterAgent).toHaveBeenCalledWith(input);
        });

        // Add tests for error cases, e.g., if createAndRegisterAgent rejects
        it("should handle registration failure", async () => {
            mockHCS10Client.createAndRegisterAgent = jest.fn().mockRejectedValue(new Error("Registration failed"));
            const tool = new RegisterAgentTool(mockHCS10Client);
            const input = { name: "Fail Agent" };
            await expect(tool._call(input)).rejects.toThrow("Failed to create/register agent: Registration failed");
        });
    });

    describe("SendMessageTool", () => {
        it("should send a message successfully", async () => {
            const tool = new SendMessageTool(mockHCS10Client);
            const input = { topicId: "0.0.123", message: "Hello World" };
            const result = await tool._call(input);
            expect(result).toContain("Successfully sent message");
            expect(mockHCS10Client.sendMessage).toHaveBeenCalledWith(input.topicId, expect.any(String));
        });

        it("should handle message sending failure", async () => {
            mockHCS10Client.sendMessage = jest.fn().mockRejectedValue(new Error("Send failed"));
            const tool = new SendMessageTool(mockHCS10Client);
            const input = { topicId: "0.0.123", message: "Fail message" };
            await expect(tool._call(input)).rejects.toThrow("Failed to send message: Send failed");
        });

    });

});
