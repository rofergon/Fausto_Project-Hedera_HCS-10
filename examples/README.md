# FaustoAgent: Hedera Consensus Service Agent Framework

FaustoAgent is an advanced implementation of the Hedera Standards Agent Kit that provides conversational AI capabilities over the Hedera Consensus Service (HCS). This document details how FaustoAgent.ts works and how to use it effectively.

## Overview

FaustoAgent is a conversational AI agent that:
- Implements the HCS-10 (Agent Communication) standard
- Uses LangChain and OpenAI for natural language understanding
- Manages connections to other agents on the Hedera network
- Processes and responds to messages using AI
- Includes a plugin system for extended functionality
- Generates and shares visual data like price charts

## Architecture

The agent consists of several interconnected components:

### Core Components
- **HCS10Client**: Core interface to the Hedera Consensus Service
- **StateManager**: Maintains agent identity and connection state
- **AgentExecutor**: Processes messages with LangChain and OpenAI
- **Tools**: Collection of functionalities for operations like registration, connections, and messaging
- **PluginRegistry**: Manages and provides access to various plugins

### Plugins
FaustoAgent comes with several built-in plugins:
- **SauceSwapPlugin**: Interfaces with SauceSwap DEX for pool and token information
- **CandlestickChartPlugin**: Generates price history charts for tokens
- **DeFiPlugin**: Handles token pricing and DeFi operations
- **HbarPricePlugin**: Fetches current HBAR cryptocurrency prices


## Operation Modes

FaustoAgent supports two primary operation modes:

### 1. Console Mode
An interactive chat interface where users can directly communicate with the agent via terminal. Commands entered are processed by the AI system which uses the appropriate tools to respond.

### 2. Automated Monitoring Mode
In this mode, the agent:
- Continuously monitors for incoming connection requests
- Automatically accepts new connections
- Sends welcome messages to newly connected agents
- Listens for messages on all established connections
- Processes incoming messages with AI and sends responses
- Implements rate limiting to prevent API overloads

## Message Processing Flow

1. **Message Deduplication**: Tracks processed messages to prevent duplicates
2. **JSON Parsing**: Formats JSON messages for better readability
3. **AI Processing**: Passes messages to the LangChain agent for understanding
4. **Tool Selection**: Agent selects appropriate tools based on message content
5. **Response Generation**: Creates responses using the selected tools
6. **Special Content Handling**: Provides custom handling for images and charts
7. **Delivery**: Sends responses back to the connection topic

## Key Features

### Agent Registration and Management
- Creates new agent identities on the Hedera network
- Manages multiple agent identities through environment variables
- Allows switching between different registered agents

### Connection Management
- Initiates connections to other agents using their account IDs
- Monitors for and accepts incoming connection requests
- Tracks connection status and history
- Automatically sends welcome messages to new connections

### Message Handling
- Processes incoming messages with AI understanding
- Generates contextually relevant responses
- Implements batch processing to prevent overloads
- Includes timeout protection for long-running operations

### Visualization Capabilities
- Generates candlestick charts for token price history
- Uploads images to Hedera for permanent storage
- Supports HRL (Hedera Resource Location) links for images
- Optimizes image quality and compression

## Plugin System

The plugin architecture allows extending functionality without modifying core code:

1. **Plugin Registration**: Plugins register with the PluginRegistry
2. **Tool Exposure**: Plugins provide tools that become available to the agent
3. **Context Sharing**: Plugins receive shared context including the HCS client
4. **Integration**: Plugin tools are seamlessly integrated with core tools

## Configuration and Environment

FaustoAgent uses environment variables for configuration:
- **HEDERA_OPERATOR_ID**: Primary Hedera account ID
- **HEDERA_PRIVATE_KEY**: Private key for the operator account
- **HEDERA_NETWORK**: Target network (mainnet or testnet)
- **OPENAI_API_KEY**: API key for OpenAI services
- **REGISTRY_URL**: URL for the HCS-11 registry service
- **WEATHER_API_KEY**: API key for weather service (optional)

Agent identities are stored with prefixed environment variables (e.g., TODD_ACCOUNT_ID, TODD_PRIVATE_KEY).



 **Select operation mode**:
   Choose between console mode or automated monitoring.

 **For automated mode**:
   - The agent will monitor connections automatically
   - Messages will be processed and responded to without user intervention
   - Console will display activity logs

## Error Handling and Recovery

FaustoAgent implements robust error handling:
- Timeout protection for AI processing
- Graceful recovery from processing errors
- Rate limiting to prevent API overloads
- Message retry logic for failed deliveries
- Fallback mechanisms for special content handling

## Extending FaustoAgent

To extend FaustoAgent with new capabilities:
1. Create a new plugin following the plugin interface pattern
2. Register the plugin with the PluginRegistry
3. Implement tools that provide the desired functionality
4. Update the agent personality to include instructions for the new tools

## Performance Considerations

- Message processing is batched to prevent overloading
- Monitoring intervals are throttled to limit API calls
- Message deduplication reduces redundant processing
- Welcome messages are only sent once per connection
- Chart generation is optimized for quality and size

## Security Features

- Environment variable-based credential management
- Topic ID validation before message processing
- Rate limiting to prevent abuse
- Timeout protection for long-running operations
- Message source verification

---

FaustoAgent demonstrates the powerful capabilities of the Hedera Standards Agent Kit for building conversational AI systems on the Hedera network. By following the HCS-10 standard, it enables interoperable agent communication with AI-powered understanding and response generation.
