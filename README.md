# SauceSwap Fausto Project

> This project is a fork of the original repository [hashgraph-online/standards-agent-kit](https://github.com/hashgraph-online/standards-agent-kit) with specific extensions and customizations for SauceSwap.

This project implements an AI agent that uses LangChain to interact with SauceSwap v2 data on the Hedera network. The agent can display information about pools, tokens, and generate real-time historical price charts, analyze data, and provide recommendations to users regarding the consulted information, or explain to users how they can interpret this information.
https://moonscape.tech/openconvai/chat?topicId=0.0.5931232

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

## Integrated Architecture: HCS-10 and SauceSwap

The project seamlessly integrates the HCS-10 standard for communication between agents with the specialized SauceSwap plugins, creating a complete solution for interacting with DeFi data through a conversational agent.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      FAUSTO AGENT                                            │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│                              ┌───────────────────────────────┐                               │
│                              │       LangChain Pipeline      │                               │
│                              │ ┌─────────────┐ ┌───────────┐ │                               │
│                              │ │   OpenAI    │ │  Memory   │ │         ┌─────────────────┐   │
│                              │ │   Model     │ │  Buffer   │ │         │  Configuration  │   │
│                              │ └─────────────┘ └───────────┘ │         │  ┌────────────┐ │   │
│                              └──────────┬────────────────────┘         │  │ HCS Topics │ │   │
│                                         │                              │  │ Agent Keys │ │   │
│                                         ▼                              │  └────────────┘ │   │
│                           ┌────────────────────────────┐               └─────────────────┘   │
│                           │      Agent Executor        │                                     │
│                           │ ┌──────────────────────────┴┐                                    │
│                           │ │      Tool Selection       │                                    │
│                           └─┬──────────────────────────┬┘                                    │
│                             │                          │                                     │
│                             ▼                          │                                     │
│     ┌──────────────────────────────────────────────────┴──────────────────────────────┐      │
│     │                            Tool Registry                                        │      │
│     └───┬──────────────┬─────────────┬────────────────┬────────────────┬─────────┬────┘      │
│         │              │             │                │                │         │           │
│         ▼              ▼             ▼                ▼                ▼         ▼           │
│  ┌─────────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────────────┐     │
│  │   HCS-10    │  │ SauceSwap│  │  SauceSwap   │  │SauceSwap │  │      SauceSwap       │     │
│  │ Base Tools  │  │Pool Tools│  │ Token Tools  │  │Pool Find │  │   Chart Generator    │     │
│  └──────┬──────┘  └─────┬────┘  └──────┬───────┘  └────┬─────┘  └────────────┬─────────┘     │
│         │               │              │               │                     │               │
└─────────┼───────────────┼──────────────┼───────────────┼─────────────────────┼───────────────┘
          │               │              │               │                     │            
          │    ┌──────────┴──────────────┴───────────────┴──────────────┐      │            
          │    │                                                        │      │            
          │    │                   ┌────────────────────┐               │      │            
          │    │                   │ SauceSwap API SDK  │               │      │            
          │    │                   │ ┌───────────────┐  │               │      │            
          │    │                   │ │ Rate Limiting │  │               │      │            
          │    │                   │ │ Caching       │  │               │      │            
          │    │                   │ │ Error Handling│  │               │      │            
          │    │                   │ └───────────────┘  │               │      │            
          │    │                   └─────────┬──────────┘               │      │            
          │    └───────────────────────────┬─┴──────────────────────┬───┘      │            
          │                                │                        │          │            
          ▼                                ▼                        │          ▼            
┌──────────────────────┐      ┌──────────────────────────┐          │ ┌───────────────────────┐
│  Hedera Consensus    │      │                          │          │ │  Image Processing &   │
│  Service (HCS)       │      │     SauceSwap API        │          │ │  HCS-3 Inscription    │
│  ┌─────────────────┐ │      │  ┌──────────────────┐    │          │ │ ┌─────────────────┐   │
│  │ Topic Creation  │ │      │  │ Pool Endpoints   │    │          └─┼─┤ Canvas Renderer │   │
│  │ Message Ordering│ │      │  │ Token Endpoints  │    │            │ │ Image Optimizer │   │
│  │ Timestamp       │ │      │  │ Chart Data       │    │            │ │ HRL Generator   │   │
│  └─────────────────┘ │      │  └──────────────────┘    │            │ └─────────────────┘   │
└──────────┬───────────┘      └──────────────────────────┘            └───────────────────────┘
           │                                                                      │           
           │                                                                      │           
           │                                                                      │           
           ▼                                                                      ▼           
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                        HEDERA NETWORK                                        │
│                                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐     │
│  │  Inbound Topics  │  │  Outbound Topics │  │ Connection Topic │  │   HCS-3 Storage   │     │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  └───────────────────┘     │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### HCS-10 Messaging System
The project uses the HCS-10 standard for communication between agents:

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

## Integration Flow: HCS-10 + SauceSwap

### 1. Agent Initialization

The process begins with the creation of the agent and initialization of components:

```typescript
// Initialize HCS-10 client
const hcsClient = new HCS10Client(operatorId, operatorKey, hederaNetwork, {
  useEncryption: false,
  registryUrl: registryUrl,
});

// Initialize state manager to maintain connection state
const stateManager = new OpenConvaiState();
stateManager.initializeConnectionsManager(hcsClient.standardClient);

// Initialize plugins
const pluginRegistry = new PluginRegistry(pluginContext);
const sauceSwapPlugin = new SauceSwapPlugin();
await pluginRegistry.registerPlugin(sauceSwapPlugin);

// Get tools from plugins
const pluginTools = pluginRegistry.getAllTools();
const tools = [...baseTools, ...pluginTools];

// Configure LangChain
const llm = new ChatOpenAI({ openAIApiKey, modelName: 'o4-mini' });
const memory = new ConversationTokenBufferMemory({
  llm, memoryKey: 'chat_history', maxTokenLimit: 4000
});

// Initialize Agent Executor
const agentExecutor = new AgentExecutor({
  agent, tools, memory, maxIterations: 4
});
```

### 2. HCS-10 Channel Configuration

The Fausto Agent establishes its communication infrastructure:

- **Structure of HCS-10 topics**:
  - **Inbound Topic**: Receives connection requests (`0.0.XXXX1`)
  - **Outbound Topic**: Sends connection requests (`0.0.XXXX2`) 
  - **Profile Topic**: Stores agent metadata (`0.0.XXXX3`)
  - **Connection Topics**: Dedicated topics for each conversation (`0.0.XXXX4`)

### 3. SauceSwap Plugin Architecture

The SauceSwap plugins are organized following a modular pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                      SauceSwap Plugin System                    │
├───────────────┬─────────────────┬──────────────┬────────────────┤
│ Pool List     │ Pool Details    │ Token Details│ Associated     │
│ Plugin        │ Plugin          │ Plugin       │ Pools Plugin   │
├───────────────┴─────────────────┴──────────────┴────────────────┤
│                                                                 │
│                     Candlestick Chart Plugin                    │
│                                                                 │
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

#### Main Components:

1. **Base Plugin (`SauceSwapPlugin`)**:
   - Entry point and registration in the system
   - Management of the plugin lifecycle

2. **SauceSwap API SDK**:
   - Abstraction to interact with the SauceSwap API
   - Implements caching, rate limiting, and error handling
   - Used by all plugin tools

3. **Individual Tools**:
   - Each tool extends LangChain's `StructuredTool`
   - Defines Zod schema for parameter validation
   - Implements specific logic in the `_call` method

#### Plugin Development Process

The SauceSwap plugins were developed following these steps:

1. **Planning**: Each plugin was designed to serve a specific purpose but they are complementary to each other for in-depth analysis
2. **Structured Organization**: Plugins follow a consistent directory structure:
   ```
   examples/plugins/SauceSwap/
   ├── index.ts                         # Plugin entry point
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

### 4. Special Focus: Candlestick Chart Plugin

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

```typescript
// Example implementation of chart tool
export class GetSauceSwapChartTool extends StructuredTool {
  name = 'get_sauceswap_chart';
  description = 'Generate a candlestick chart for a SauceSwap pool';
  
  schema = z.object({
    poolId: z.number().describe('ID of the pool to chart'),
    timeRange: z.string().describe('Time range (e.g., "1h", "4h", "1d", "1w")'),
    inverted: z.boolean().optional().describe('Invert price calculation'),
    uploadToHedera: z.boolean().optional().describe('Upload chart to Hedera'),
    sendDirectlyInChat: z.boolean().optional().describe('Send directly to chat'),
    quality: z.number().min(1).max(100).optional().describe('Image quality')
  });
  
  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      // 1. Get historical data from API
      const historicalData = await this.apiClient.getPoolPriceHistory(
        input.poolId, 
        this.parseTimeRange(input.timeRange)
      );
      
      // 2. Generate chart with Canvas
      const chartBuffer = await this.canvasRenderer.generateCandlestickChart(
        historicalData,
        input.inverted
      );
      
      // 3. If requested, upload to Hedera using HCS-3
      if (input.uploadToHedera) {
        const quality = input.quality || 80;
        const optimizedBuffer = await this.imageOptimizer.compress(
          chartBuffer, 
          quality
        );
        
        const hrlLink = await this.uploadToHedera(optimizedBuffer);
        
        // 4. Return appropriate format based on configuration
        if (input.sendDirectlyInChat) {
          return hrlLink;
        } else {
          return JSON.stringify({
            chart: "Generated successfully",
            timeRange: input.timeRange,
            poolId: input.poolId,
            hrlLink: hrlLink
          });
        }
      }
      
      // If not uploading to Hedera, save locally
      const filename = `pool_${input.poolId}_${Date.now()}.png`;
      await fs.writeFile(`./charts/${filename}`, chartBuffer);
      return `Chart saved to ./charts/${filename}`;
    } catch (error) {
      return `Error generating chart: ${error.message}`;
    }
  }
}
```

### 5. HCS-10 Integration with HCS-3 for Charts

A standout feature is how two Hedera standards are merged:

#### A. HCS-10 for Messaging
- **Purpose**: Message transport and connection establishment
- **Features**: Ordering, timestamping, asynchronous responses

#### B. HCS-3 for Inscriptions (Images)
- **Purpose**: Store content (charts) on the Hedera network
- **Features**: Inscriptions, fragmentation for large content

```typescript
// Example of HCS-3 inscription for images
async function uploadToHedera(imageBuffer: Buffer, quality: number = 80): Promise<string> {
  try {
    // Optimize image to reduce size
    const optimizedBuffer = await sharp(imageBuffer)
      .png({ quality })
      .toBuffer();
      
    // Create an HCS-3 inscription using the standard client
    const inscription = new HCS3Inscription(
      hcsClient.standardClient,
      optimizedBuffer,
      {
        contentType: 'image/png',
        chunkSize: 4000, // Fragment size for large inscriptions
        maxRetries: 3
      }
    );
    
    // Upload the inscription and get the topicId for the HRL link
    const result = await inscription.submit();
    
    if (result.success) {
      // HRL formats: either hcs://0.0.XXXXX or hcs://1/XXXXX (Hedera Resource Locator)
      return `hcs://${result.topicId}`;
    } else {
      throw new Error(`Inscription failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Error uploading image to Hedera:', error);
    throw error;
  }
}
```

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
const hrlRegex = /(hcs:\/\/(?:0\.0\.[0-9]+|1\/[0-9]+))/i;
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

## How to Run the Project

### Prerequisites
- Node.js 18 or higher
- Hedera account with balance for HCS operations
- OpenAI API key

### Configuration

1. Clone the repository:
   ```bash
   git clone https://github.com/rofergon/Fausto_Project-Hedera_HCS-10.git
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

### Run the Fausto Agent

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

## Benefits of Integration

The integrated architecture offers significant advantages:

1. **Persistence**: All communications and responses are permanently recorded on the Hedera network
2. **Multimedia Content**: Ability to generate and share complex visualizations through HCS-3
3. **Scalability**: Modular design that allows easy addition of new plugins
4. **Decentralization**: No central point of failure in communication
5. **Verifiability**: All transactions are verifiable on the public network
6. **Reliability**: The HCS sequencing system ensures consistent message ordering

## Future Improvements

The architecture allows several extensions:

1. **Additional Plugins**: New plugins for different DeFi protocols
2. **Resource Optimization**: Improvements in image compression and fragmentation
3. **Multi-Agent Support**: Communication between multiple specialized agents
4. **E2E Encryption**: Implementation of end-to-end encryption for private messages
5. **IPFS Storage**: Integration with IPFS for larger images

## Usage Examples

Here are practical examples of how users can interact with the Fausto agent using SauceSwap plugins:

### Basic Pool Information

```
User: Show me the top 10 liquidity pools on SauceSwap.
Fausto: Here are the current SauceSwap Pools (mainnet) - Page 1/5 (Total: 42)

ID | Pair | Token Prices | LP Price
---|------|-------------|--------
1 | HBAR-USDC | HBAR: $0.10, USDC: $1.00 | $53.24
2 | HBAR-SAUCE | HBAR: $0.10, SAUCE: $0.45 | $18.75
3 | USDC-SAUCE | USDC: $1.00, SAUCE: $0.45 | $28.90
...

Use command "pool details 1" to see detailed information about a specific pool.
```

### Detailed Pool Analysis

```
User: Give me more details about the HBAR-USDC pool.
Fausto: Let me get that information for you.

Pool 1 (HBAR-USDC) details:

{
  "id": 1,
  "contractId": "0.0.738891",
  "pair": "HBAR-USDC",
  "lpToken": {
    "symbol": "HBAR-USDC-LP",
    "priceUsd": 53.24,
    "totalReserve": "8945023.482"
  },
  "tokens": {
    "HBAR": {
      "id": "0.0.732831",
      "priceUsd": 0.103,
      "reserve": "45328902.482",
      "website": "https://hedera.com"
    },
    "USDC": {
      "id": "0.0.456858",
      "priceUsd": 1.00,
      "reserve": "4678345.32",
      "website": "https://www.circle.com/en/usdc"
    }
  }
}
```

### Token Research

```
User: I'm interested in the SAUCE token. What can you tell me about it?
Fausto: Here's what I found about the SAUCE token:

{
  "id": "0.0.731861",
  "name": "SaucerSwap Token",
  "symbol": "SAUCE",
  "decimals": 8,
  "priceUsd": 0.45,
  "price": "$0.45",
  "description": "SAUCE is the governance and utility token of the SaucerSwap DEX ecosystem on Hedera.",
  "dueDiligenceComplete": true,
  "isFeeOnTransferToken": false,
  "website": "https://saucerswap.finance",
  "twitterHandle": "SaucerSwap",
  "icon": "https://assets.saucerswap.finance/tokens/SAUCE.png"
}

Would you like to see the pools where you can trade SAUCE?
```

### Multi-Pool Analysis

```
User: Find all pools that contain the SAUCE token and compare them.
Fausto: I found 3 pools containing the SAUCE token (0.0.731861):

[
  {
    "poolId": 2,
    "contractId": "0.0.738892",
    "lpToken": {
      "symbol": "HBAR-SAUCE-LP",
      "priceUsd": 18.75,
      "totalReserve": "1234567.89"
    },
    "tokenA": {
      "id": "0.0.732831", // HBAR
      "name": "Hbar",
      "symbol": "HBAR",
      "priceUsd": 0.103,
      "reserve": "9876543.21"
    },
    "tokenB": {
      "id": "0.0.731861", // SAUCE
      "name": "SaucerSwap Token",
      "symbol": "SAUCE",
      "priceUsd": 0.45,
      "reserve": "2345678.90"
    }
  },
  {
    "poolId": 3,
    "contractId": "0.0.738893",
    "lpToken": {
      "symbol": "USDC-SAUCE-LP",
      "priceUsd": 28.90,
      "totalReserve": "3456789.01"
    },
    "tokenA": {
      "id": "0.0.456858", // USDC
      "name": "USD Coin",
      "symbol": "USDC",
      "priceUsd": 1.00,
      "reserve": "1500000.00"
    },
    "tokenB": {
      "id": "0.0.731861", // SAUCE
      "name": "SaucerSwap Token",
      "symbol": "SAUCE",
      "priceUsd": 0.45,
      "reserve": "3333333.33"
    }
  },
  // Additional pool info...
]

The HBAR-SAUCE pool has the highest liquidity with 2.3M SAUCE tokens. The USDC-SAUCE pool offers direct stablecoin pairing.
```

### Price Chart Generation

```
User: Can you show me a price chart for the HBAR-USDC pool over the last week?
Fausto: Here's the candlestick chart for Pool #1 (HBAR-USDC) over the last 7 days:

[Chart Image appears here]

The chart shows a price range between $0.095 and $0.11 per HBAR in terms of USDC. There was a significant price increase on Wednesday followed by consolidation over the weekend. Volume has been consistent throughout the period.
```

### Investment Analysis

```
User: I'm considering providing liquidity to the HBAR-USDC pool. What information should I consider?
Fausto: Here are key factors to consider before providing liquidity to the HBAR-USDC pool (ID: 1):

1. **Current Stats**:
   - Total Liquidity: $4.7M USDC and 45.3M HBAR
   - LP Token Price: $53.24
   - Trading Volume (24h): $320,452

2. **Impermanent Loss Risk**:
   - HBAR has 30-day volatility of 8.2%
   - As a stablecoin pair, you're exposed to HBAR price movements
   - During the past week, IL would have been approximately -1.3%

3. **Fee Income**:
   - Current APR from fees: ~7.2%
   - Based on 0.25% trading fee and current volume

4. **Current Pool Ratio**:
   - 45.3M HBAR : 4.7M USDC
   - You would need to provide assets in this exact ratio

Would you like me to generate a price chart to analyze recent volatility patterns?
```

### Advanced Queries

```
User: Compare the performance of SAUCE across all liquidity pools over the last month.
Fausto: Analyzing SAUCE token (0.0.731861) performance across all pools over the last month:

**Price Performance**:
- Current Price: $0.45
- 30 days ago: $0.39
- Change: +15.4%

**Pool Comparison**:
1. **HBAR-SAUCE Pool (ID: 2)**:
   - Volume (30d): $1.2M
   - Liquidity: $2.34M
   - Price impact (100k SAUCE): 0.8%
   
2. **USDC-SAUCE Pool (ID: 3)**:
   - Volume (30d): $1.8M
   - Liquidity: $3.33M
   - Price impact (100k SAUCE): 0.6%

3. **HSUITE-SAUCE Pool (ID: 7)**:
   - Volume (30d): $450k
   - Liquidity: $980k
   - Price impact (100k SAUCE): 2.1%

**Analysis**:
- USDC-SAUCE has the highest volume and deepest liquidity
- HBAR-SAUCE shows slightly higher price volatility
- For large trades, USDC-SAUCE offers the best execution price

Here's a chart comparing price movement across all three pools:
[Chart Image appears here]
```

These examples demonstrate how the Fausto agent can provide comprehensive DeFi analytics by combining data from multiple SauceSwap plugins, generating visual charts, and offering contextual analysis to help users make informed decisions.

## Conclusion

This project demonstrates how to integrate LangChain with the HCS-10 standard to create autonomous agents that interact with DeFi data on Hedera. The modular plugin architecture allows easy extension of functionality, as showcased by the SauceSwap plugins, particularly the sophisticated chart generation capabilities. 
