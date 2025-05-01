# SauceSwap LangChain Demo

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

### Run the LangChain Demo

```bash
npm run langchain-demo
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
- Adjust `AGENT_PERSONALITY` in `langchain-demo.ts` to change the instructions
- Modify `WELCOME_MESSAGE` to customize the initial message
- Create additional plugins in the `examples/plugins` folder

## 🔍 Plugin Development Guide

> ### Implementation of SauceSwap Plugins
> 
> The SauceSwap plugins were developed following the plugin architecture pattern of the base project. Each plugin functions as an independent module that implements the system's `Plugin` interface, allowing seamless integration with the LangChain framework and HCS-10 communication.
> 
> #### SauceSwap folder structure
> ```
> examples/plugins/SauceSwap/
> ├── index.ts                          # Plugin entry point
> ├── CandlestickPlugin/                # Candlestick chart plugin
> │   ├── utils/                        # Helper functions for charts
> │   ├── services/                     # Services for historical data
> │   └── __tests__/                    # Unit tests
> ├── get_sauceswap_pools/              # Plugin for listing pools
> ├── get_sauceswap_pool_details/       # Plugin for pool details
> ├── get_sauceswap_token_details/      # Plugin for token information
> └── get_sauceswap_associated_pools/   # Plugin for pools associated with a token
> ```
> 
> #### Development of the Chart Plugin (CandlestickPlugin)
> 
> The price chart plugin was the most complex component, implementing:
> 
> 1. **Historical data retrieval**: Queries to the SauceSwap API to get OHLC (Open-High-Low-Close) data
> 2. **Chart generation**: Using the `canvas` library to create high-quality PNG images
> 3. **Hedera storage**: Image uploading using the HCS-3 standard for inscriptions
> 4. **Chat integration**: Special handling of HRL links for rendering in OpenConvAI
> 
> The implementation leverages the HCS-10 messaging system to send and receive both text and images, using a two-step mechanism for charts:
> 
> ```typescript
> // Example of sending a chart via HCS-10
> if (uploadToHedera) {
>   // First upload the image to Hedera with HCS-3
>   const hrlLink = await this.uploadToHedera(chartBuffer, quality);
>   
>   // If direct chat sending is requested, return only the HRL link
>   if (sendDirectlyInChat) {
>     return hrlLink;
>   } else {
>     return {
>       chartInfo: { /* Chart information */ },
>       hrlLink
>     };
>   }
> }
> ```
> 
> #### How to Implement New Plugins
> 
> To develop similar new plugins:
> 
> 1. **Create the folder structure**:
>    ```bash
>    mkdir -p examples/plugins/MyPlugin/{utils,services,__tests__}
>    ```
> 
> 2. **Implement the Plugin interface**:
>    ```typescript
>    import { Plugin, PluginContext } from '../../../src/plugins';
>    
>    export default class MyPlugin implements Plugin {
>      id = 'my-plugin';
>      name = 'My Custom Plugin';
>      description = 'Description of my plugin';
>      tools = [];
>      
>      constructor() {
>        this.tools = [
>          /* Define LangChain tools here */
>        ];
>      }
>      
>      async initialize(context: PluginContext): Promise<void> {
>        /* Plugin initialization */
>      }
>    }
>    ```
> 
> 3. **Register the plugin** in `examples/langchain-demo.ts`:
>    ```typescript
>    import MyPlugin from './plugins/MyPlugin';
>    // ...
>    await pluginRegistry.registerPlugin(new MyPlugin());
>    ```
> 
> 4. **Test the plugin**:
>    ```bash
>    npm run langchain-demo
>    ```
> 
> This modular approach allows easy extension of the agent's functionality without modifying its core, following the design principles of the original project.

## Conclusion

This demo shows how to integrate LangChain with the HCS-10 standard to create autonomous agents that interact with DeFi data on Hedera. The plugin system allows easy extension of functionality for new use cases.

