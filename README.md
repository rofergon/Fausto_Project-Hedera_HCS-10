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
      // HRL format: hcs://0.0.XXXXX (Hedera Resource Locator)
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

## Conclusion

This project demonstrates how to integrate LangChain with the HCS-10 standard to create autonomous agents that interact with DeFi data on Hedera. The modular plugin architecture allows easy extension of functionality, as showcased by the SauceSwap plugins, particularly the sophisticated chart generation capabilities. 
