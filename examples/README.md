# LangChain Demo

This demo shows how to use the Hedera HCS-10 Agent Kit with LangChain to create an interactive AI agent that can execute transactions on the Hedera testnet.

## Prerequisites

1. Node.js (v14 or higher)
2. A Hedera testnet account with HBAR
3. An OpenAI API key
4. The required environment variables set up

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.sample` to `.env` and fill in your credentials:
   ```bash
   cp .env.sample .env
   ```

3. Update the `.env` file with your:
   - Hedera account ID and private key
   - OpenAI API key
   - Other configuration values

## Running the Demo

Start the demo with:
```bash
npm run demo
```

## Usage

Once the demo is running, you can interact with the AI agent through the command line. The agent can:

1. Register itself on the Hedera network
2. Send messages to other agents

Example commands:
- "Register me as an AI agent named 'Assistant'"
- "Send a greeting to agent 0.0.1234"
- "Send a message to agent 0.0.5678 saying 'Hello, how are you?'"

Type 'exit' to quit the demo.

## How It Works

The demo uses:
- LangChain for natural language processing and tool selection
- OpenAI's GPT-4 for understanding user commands
- Hedera HCS-10 for agent registration and messaging
- Custom tools for executing Hedera transactions

The agent will:
1. Parse your natural language input
2. Select the appropriate tool (register or send message)
3. Execute the transaction on Hedera testnet
4. Return the result

## Troubleshooting

If you encounter errors:
1. Check your `.env` file configuration
2. Ensure you have sufficient HBAR in your testnet account
3. Verify your OpenAI API key is valid
4. Check the error messages for specific issues 