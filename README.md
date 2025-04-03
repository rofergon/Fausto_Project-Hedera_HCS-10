# Hashgraph Online Standards AI Agent Kit

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A toolkit built with TypeScript and LangChain for creating AI agents that communicate trustlessly on the Hedera network using the [HCS-10 AI Agent Communication Standard](https://hashgraphonline.com/docs/standards/hcs-10/).

This kit provides:

- A client (`HCS10Client`) simplifying interactions with the HCS-10 standard via the `@hashgraphonline/standards-sdk`.
- LangChain Tools (`RegisterAgentTool`, `SendMessageTool`, `ConnectionTool`) for easy integration into LangChain agents.
- Example demos showcasing agent registration, connection monitoring, and messaging.

## Features

- **HCS-10 Compliance:** Built on top of the official `@hashgraphonline/standards-sdk` for standard compliance.
- **Agent Lifecycle Management:** Create, register, and manage HCS-10 agents on Hedera.
- **Trustless Communication:** Facilitates secure peer-to-peer communication setup between agents via Hedera Consensus Service (HCS).
- **LangChain Integration:** Provides ready-to-use LangChain `StructuredTool`s for common agent actions.
- **Message Handling:** Send and receive messages over HCS, including support for large messages via HCS-3 inscriptions (handled by the underlying SDK).
- **Connection Monitoring:** Automatically monitor inbound topics for connection requests and handle them.
- **Configurable:** Set Hedera network, credentials, and registry via environment variables.

## Prerequisites

- **Node.js:** Version 18 or higher recommended.
- **npm:** Node Package Manager (usually comes with Node.js).
- **Hedera Testnet Account:** You need an Account ID and Private Key for the Hedera Testnet. You can get one from [Hedera Portal](https://portal.hedera.com/).
- **(Optional) OpenAI API Key:** Required for running the LangChain agent demos (`examples/interactive-demo.ts`).

## Installation

1.  **Clone the repository:**

    ```bash
    git clone <your-repository-url>
    cd hashgraph-online-agent-kit
    ```

2.  **Install dependencies:**
    This project has known peer dependency conflicts between different versions of LangChain packages. Use the `--legacy-peer-deps` flag to install:
    ```bash
    npm install --legacy-peer-deps
    ```

## Configuration

1.  **Create a `.env` file:** Copy the example file:

    ```bash
    cp .env.sample .env
    ```

2.  **Edit `.env`:** Fill in your Hedera credentials and optionally other settings:

    ```dotenv
    # Hedera Credentials (Required)
    HEDERA_ACCOUNT_ID=0.0.xxxxxx
    HEDERA_PRIVATE_KEY=302e020100300506032b6570...

    # Hedera Network (Optional - defaults to 'testnet')
    HEDERA_NETWORK=testnet

    # HCS-10 Registry URL (Optional - defaults to SDK's default https://moonscape.tech)
    REGISTRY_URL=https://moonscape.tech

    # OpenAI API Key (Optional - needed for LangChain demos)
    OPENAI_API_KEY=sk-xxxxxxxxxx

    # --- Agent Specific Variables (Optional - used/set by demos) ---
    # These might be populated automatically by demos like cli-demo
    ALICE_ACCOUNT_ID=
    ALICE_PRIVATE_KEY=
    ALICE_INBOUND_TOPIC_ID=
    ALICE_OUTBOUND_TOPIC_ID=
    BOB_ACCOUNT_ID=
    BOB_PRIVATE_KEY=
    BOB_INBOUND_TOPIC_ID=
    BOB_OUTBOUND_TOPIC_ID=
    CONNECTION_TOPIC_ID=
    OPERATOR_ID=
    ```

## Usage

### Initialization

The primary way to use the kit is by initializing the client and tools using the `initializeHCS10Client` function from the main entry point (`src/index.ts`). This requires your operator account ID and private key to be set in the environment variables.

```typescript
import { initializeHCS10Client } from 'hashgraph-online-agent-kit'; // Adjust path based on usage
import dotenv from 'dotenv';

dotenv.config(); // Load .env variables

async function setup() {
  try {
    const { hcs10Client, tools } = await initializeHCS10Client({
      // Options are optional
      useEncryption: false, // Defaults to false
      registryUrl: process.env.REGISTRY_URL, // Defaults to SDK's default
    });

    console.log('HCS10 Client and Tools Initialized!');

    // Now you can use hcs10Client directly or use the tools
    const registerTool = tools.registerAgentTool;
    const sendMessageTool = tools.sendMessageTool;
    const connectionTool = tools.connectionTool;

    // Example: Register an agent using the tool
    // const registrationResult = await registerTool.call({ name: "MyDemoAgent" });
    // console.log(registrationResult);
  } catch (error) {
    console.error('Initialization failed:', error);
  }
}

setup();
```

### Core Components

- **`HCS10Client` (`src/hcs10/HCS10Client.ts`):**
  - Wraps the `@hashgraphonline/standards-sdk` HCS10Client.
  - Provides methods like `createAndRegisterAgent`, `sendMessage`, `getMessages`, `handleConnectionRequest`, `getMessageContent`.
  - Initialized via the static async factory `HCS10Client.create(operatorId, privateKey, network, options)`.
- **Tools (`src/tools/`):**
  - `RegisterAgentTool`: LangChain tool to create and register a new HCS-10 agent.
  - `SendMessageTool`: LangChain tool to send a message to a topic and optionally monitor for a response.
  - `ConnectionTool`: LangChain tool to start monitoring an agent's inbound topic for connection requests and handle them automatically in the background.

## Running Demos

Make sure you have configured your `.env` file correctly.

1.  **Build the project:**

    ```bash
    npm run build
    ```

    _(Note: `npm install` also runs the build via the `prepare` script)_

2.  **Run the CLI Demo:**
    This demo provides an interactive menu to register an agent and monitor its connections.

    ```bash
    npm run cli-demo
    ```

3.  **Run the LangChain Interactive Demo:**
    This demo uses LangChain to create an agent that can use the HCS-10 tools. Requires `OPENAI_API_KEY` in `.env`.
    ```bash
    npm run langchain-demo
    ```

## Project Structure

```
.
├── dist/               # Compiled JavaScript output
├── examples/           # Demo usage scripts
│   ├── cli-demo.ts     # Interactive CLI demo
│   ├── langchain-demo.ts # LangChain agent interactive demo
│   └── ...
├── src/                # Source code
│   ├── hcs10/          # HCS-10 client and types
│   │   ├── HCS10Client.ts # Main client wrapper
│   │   └── types.ts       # Core data types
│   ├── tools/          # LangChain tools
│   │   ├── RegisterAgentTool.ts
│   │   ├── SendMessageTool.ts
│   │   └── ConnectionTool.ts
│   ├── utils/          # Utility functions (logging, Hedera client setup)
│   └── index.ts        # Main entry point, initializes client/tools
├── tests/              # Unit tests
├── .env.sample         # Sample environment file
├── package.json        # Project dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── README.md           # This file
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request. (Add more specific guidelines if needed).

## License

This project is licensed under the Apache-2.0 License - see the [LICENSE](LICENSE) file for details.
