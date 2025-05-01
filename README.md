# SauceSwap Fausto Project

> This project is a fork of the original repository [hashgraph-online/standards-agent-kit](https://github.com/hashgraph-online/standards-agent-kit) with specific extensions and customizations for SauceSwap.

This project implements an AI agent that uses LangChain to interact with SauceSwap v2 data on the Hedera network. The agent can display information about pools, tokens, and generate real-time historical price charts, analyze data, and provide recommendations to users regarding the consulted information, or explain to users how they can interpret this information.

## Main Features

### SauceSwap Plugins
The project includes several specialized plugins to interact with SauceSwap:

- **get_sauceswap_pools**: Gets a paginated list of available pools (10 per page)
- **get_sauceswap_pool_details**: Shows detailed information about a specific pool
- **get_sauceswap_token_details**: Provides complete data about any token
- **get_sauceswap_associated_pools**: Finds all pools that contain a specific token

### Price Charts (CandlestickPlugin)
The most notable component is the historical price chart generator:

- Generates candlestick charts for any SauceSwap pool
- Supports multiple time ranges (1h, 4h, 12h, 1d, 3d, 7d, 1w, 2w, etc.)
- Allows inverting the price calculation
- Works on mainnet and testnet
- Saves charts as PNG files
- Includes options for:
  - Compressing images with adjustable quality
  - Uploading charts to Hedera for permanent storage
  - Sending images directly to chat for real-time rendering

## Integration with HCS-10 and LangChain

### HCS-10 Messaging System
The demo uses the HCS-10 standard for communication between agents:

- **Message Automation**: Adapted from StandardsExpertAgent to process incoming messages
- **HCS Topics**: Uses Hedera Consensus Service topics for communication
- **Connection Management**: Automatic monitoring and acceptance of connection requests

### LangChain Integration
The architecture implements:

- **Agent Executor**: Processes messages and executes appropriate tools
- **Memory Buffer**: Maintains conversation context
- **Prompt Template**: Custom instructions for the model
- **Tools Structure**: Structured LangChain tools for each function
- **OpenAI Integration**: Uses OpenAI models for natural language processing

## Message Processing

The system implements sophisticated message handling:

1. **Automated Monitoring**: Periodically checks for new messages in all connections
2. **Batch Processing**: Limits processing to 5 messages per cycle for stability
3. **Duplicate Detection**: Avoids processing the same message twice
4. **HRL Handling**: Correctly detects and processes HRL links for image rendering
5. **Watchdog Timer**: Protection against blocking due to problematic messages

### Key Code for HRL Messages (Images)
```typescript
// Detection of HRL links for images
const hrlRegex = /(hcs:\/\/0\.0\.[0-9]+)/i;
const hrlMatch = outputText.match(hrlRegex);

if (hrlMatch && hrlMatch[1]) {
  const hrlLink = hrlMatch[1];
  
  // Send only the HRL link for rendering
  await sendMessageTool.invoke({
    topicId: topicId,
    message: hrlLink,
    isHrl: true,
    disableMonitoring: true,
  });
  
  // Send text message as context
  let textResponse = outputText.replace(hrlLink, "").trim();
  if (!textResponse) {
    textResponse = `Chart generated for the pool`;
  }
  
  await sendMessageTool.invoke({
    topicId: topicId,
    message: `[Reply to #${sequenceNumber}] ${textResponse}`,
    memo: `Additional info for chart`,
    disableMonitoring: true,
  });
}
```

## 🔍 HCS-10 Architecture Overview

The Fausto project leverages the HCS-10 OpenConvAI Standard for secure, decentralized agent communication on Hedera.

```
┌─────────────────────────────┐       ┌──────────────────────────┐
│      Agent Registration     │       │    Message Processing    │
│ ┌─────────────────────────┐ │       │ ┌────────────────────┐   │
│ │  Register new agents    │ │       │ │ Message detection  │   │
│ │  Create HCS topics      │◄┼───────┼─┤ Sequence tracking  │   │
│ │  Generate account & key │ │       │ │ Duplicate handling │   │
│ └─────────────────────────┘ │       │ └────────────────────┘   │
└─────────────────────────────┘       └──────────────┬───────────┘
                                                    │
               ┌──────────────────────────────────┐ │
               │       Connection Management       │ │
               │ ┌────────────────────────────┐   │ │
               │ │Monitor connection requests │◄──┼─┘
               │ │Accept incoming connections │   │
               │ │Maintain connection states  │   │
               │ └────────────────────────────┘   │
               └──────────────────┬───────────────┘
                                  │
┌────────────────────────────────▼────────────────────────────┐
│                     HCS-10 Message Flow                      │
│                                                              │
│  1. Client sends message to topic via Hedera Consensus Svc   │
│  2. Message is ordered and timestamped on the ledger         │
│  3. All subscribers receive the consistent message stream    │
│  4. Message is processed by Fausto agent                     │
│  5. Response flows back through the same HCS channel         │
└──────────────────────────────────────────────────────────────┘
```

Key components:
- Each agent has three HCS topics: inbound, outbound, and profile
- Connections follow a request-accept-confirm protocol
- Message processing uses sequence tracking to prevent duplicates
- HRL links enable image sharing via HCS-3 inscriptions

## 🧩 SauceSwap Plugin Architecture

The SauceSwap plugins were developed following a modular architecture pattern that enables seamless integration with both the LangChain framework and HCS-10 communication.

```
┌─────────────────────────────────────────────────────────────────┐
│                      SauceSwap Plugin System                     │
├───────────────┬─────────────────┬──────────────┬────────────────┤
│ Pool List     │ Pool Details    │ Token Details│ Associated     │
│ Plugin        │ Plugin          │ Plugin       │ Pools Plugin   │
├───────────────┴─────────────────┴──────────────┴────────────────┤
│                                                                  │
│                     Candlestick Chart Plugin                     │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Chart       │  │ Data        │  │ Hedera Integration      │  │
│  │ Generation  │  │ Retrieval   │  │ ┌─────────────────────┐ │  │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ │ HCS-3 Inscription   │ │  │
│  │ │ Canvas  │ │  │ │ API     │ │  │ │ Image Upload        │ │  │
│  │ │ Renderer│ │  │ │ Client  │ │  │ │ HRL Generation      │ │  │
│  │ └─────────┘ │  │ └─────────┘ │  │ └─────────────────────┘ │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Plugin Development Process

The SauceSwap plugins were developed following these steps:

1. **Planning**: Each plugin was designed to serve a specific purpose (listing pools, getting pool details, generating charts)
2. **Structured Organization**: Plugins follow a consistent directory structure:
   ```
   examples/plugins/SauceSwap/
   ├── index.ts                         # Main plugin entry point
   ├── get_sauceswap_pools/             # Plugin for listing pools
   ├── get_sauceswap_pool_details/      # Plugin for pool details
   └── CandlestickPlugin/               # Advanced chart generation
       ├── utils/                       # Helper functions
       ├── services/                    # API services
       └── __tests__/                   # Unit tests
   ```
3. **Tool Implementation**: Each plugin extends LangChain's `StructuredTool` class
4. **Error Handling**: Robust error handling for API failures and edge cases
5. **Integration**: Registration with the main agent through the plugin registry

### Spotlight: CandlestickChart Plugin

The chart plugin is the most sophisticated, implementing:

1. **Historical Data Retrieval**:
   - Fetches OHLC (Open-High-Low-Close) price data from SauceSwap API
   - Supports various time ranges and intervals
   - Handles pagination and data normalization

2. **Chart Generation**:
   - Uses Canvas API to render high-quality candlestick charts
   - Implements price scaling and time axis formatting
   - Supports customizable chart styling and options

3. **Hedera Integration**:
   - Uploads chart images to Hedera using HCS-3 inscriptions
   - Generates Hedera Resource Locator (HRL) links for sharing
   - Optimizes image compression for on-chain storage

4. **OpenConvAI Rendering**:
   - Special HRL handling for in-chat image rendering
   - Two-step message process for maximum compatibility
   - Separation of image data and contextual text

Example tool definition:
```typescript
export class GetSauceSwapChartTool extends StructuredTool {
  name = 'get_sauceswap_chart';
  description = 'Generate a candlestick chart for SauceSwap pools with various time ranges';
  
  schema = z.object({
    poolId: z.number().describe('ID of the pool to chart'),
    timeRange: z.string().describe('Time range (e.g., "1h", "4h", "1d", "1w")'),
    inverted: z.boolean().optional().describe('Invert price calculation'),
    uploadToHedera: z.boolean().optional().describe('Upload chart to Hedera'),
    sendDirectlyInChat: z.boolean().optional().describe('Send directly to chat'),
    quality: z.number().min(1).max(100).optional().describe('Image quality')
  });
  
  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    // Implementation details for chart generation
  }
}
```

## How to Run the Project

### Prerequisites
- Node.js 18 or higher
- Hedera account with balance for HCS operations
- OpenAI API key

### Configuration

1. Clone the repository:
   ```bash
   git clone https://https://github.com/rofergon/Fausto_Project-Hedera_HCS-10.git
   cd standards-agent-kit
   ```

2. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```

3. Create environment variables file:
   ```bash
   cp .env.sample .env
   ```

4. Configure variables in the `.env` file:
   ```
   HEDERA_OPERATOR_ID=0.0.xxxxxx
   HEDERA_OPERATOR_KEY=302e020100300506032b6570...
   HEDERA_NETWORK=testnet
   REGISTRY_URL=https://moonscape.tech
   OPENAI_API_KEY=sk-xxxxxxxxxx
   ```

### Run the FaustoAgent 

```bash
npm run fausto-agent
```

When starting, the application:
1. Loads available agents (or uses the default one)
2. Asks to select an operation mode:
   - Console Mode: For direct interaction with the agent
   - Automated Mode: For continuous monitoring of HCS connections

### Using Automated Mode

In automated mode, the agent:
1. Continuously monitors incoming connection requests
2. Automatically accepts new connections
3. Sends a welcome message to each new connection
4. Checks for new messages every 5 seconds
5. Processes questions about SauceSwap and generates responses/charts

## Customization

To modify the agent's behavior:
- Adjust `AGENT_PERSONALITY` in `FaustoAgent.ts` to change the instructions
- Modify `WELCOME_MESSAGE` to customize the initial message
- Create additional plugins in the `examples/plugins` folder

## Conclusion

This project demonstrates how to integrate LangChain with the HCS-10 standard to create autonomous agents that interact with DeFi data on Hedera. The modular plugin architecture allows easy extension of functionality, as showcased by the SauceSwap plugins, particularly the sophisticated chart generation capabilities.

