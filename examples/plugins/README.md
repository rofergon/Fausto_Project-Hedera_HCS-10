# Creating Custom Tools for Standards Agent Kit

This guide explains how to create custom tools and plugins for the Standards Agent Kit, using SauceSwap as our example.

## Table of Contents
- [Plugin Structure](#plugin-structure)
- [Step-by-Step Guide](#step-by-step-guide)
- [Testing Your Plugin](#testing-your-plugin)
- [Integration with LangChain Demo](#integration-with-langchain-demo)
- [Best Practices](#best-practices)

## Plugin Structure

Plugins can be organized in two ways depending on complexity:

### Simple Plugin Structure
```
examples/plugins/YourPlugin/
├── __tests__/              # Test files
│   └── index.test.ts       # Unit tests for your plugin
├── index.ts                # Main plugin file with tool implementation
└── README.md               # Plugin documentation
```

### Complex Plugin Structure (Multiple Tools)
```
examples/plugins/YourPlugin/
├── index.ts                # Main plugin file that exports all tools
├── tool1_name/             # Directory for first tool
│   ├── __tests__/          # Tests for first tool
│   │   └── index.test.ts
│   └── index.ts            # Implementation of first tool
├── tool2_name/             # Directory for second tool
│   ├── __tests__/          # Tests for second tool
│   │   └── index.test.ts
│   └── index.ts            # Implementation of second tool
└── README.md               # Plugin documentation
```

## Step-by-Step Guide

### 1. Plan Your Tool

First, define what your tool will do:
- **Purpose**: What problem does your tool solve?
- **Parameters**: What inputs will it accept?
- **API Integration**: Will it communicate with external APIs?
- **Return Format**: What data will it return to the agent?

Example (SauceSwap Pool Details Tool):
- **Purpose**: Get detailed information about a specific SauceSwap pool by ID
- **API Endpoint**: `/pools/{poolId}`
- **Parameters**: 
  - `poolId` (required): ID of the pool to retrieve
  - `network` (optional): 'mainnet' or 'testnet'
- **Response Format**: Formatted pool information including tokens, reserves, etc.

### 2. Create the Directory Structure

For a new tool in an existing plugin:
```bash
mkdir -p examples/plugins/YourPlugin/your_tool_name/__tests__
```

For a completely new plugin:
```bash
mkdir -p examples/plugins/YourPlugin/__tests__
```

### 3. Implement the Tool

Create a tool class extending `StructuredTool`:

```typescript
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export class YourCustomTool extends StructuredTool {
  name = 'your_tool_name';
  description = 'Description of what your tool does';
  
  // Define the input schema using Zod
  schema = z.object({
    param1: z.string().describe('Description of parameter 1'),
    param2: z.number().optional().describe('Optional parameter 2')
  });
  
  // Implement the _call method
  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      // Your tool's logic here
      return 'Result of your tool';
    } catch (error) {
      console.error('[YourTool] Error:', error);
      return `Error in your tool: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
```

### 4. Write Tests

Create comprehensive tests in the `__tests__` directory:

```typescript
import { YourCustomTool } from '../index';

describe('YourCustomTool', () => {
  let tool: YourCustomTool;

  beforeEach(() => {
    tool = new YourCustomTool();
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('your_tool_name');
    expect(tool.description).toContain('Description');
  });

  it('should handle successful execution', async () => {
    // Test happy path
  });

  it('should handle error cases', async () => {
    // Test error scenarios
  });
});
```

### 5. Create or Update the Plugin Class

For a new plugin, create a class extending `BasePlugin`:

```typescript
import { BasePlugin, PluginContext } from '../../../src/plugins';
import { StructuredTool } from '@langchain/core/tools';
import { YourCustomTool } from './your_tool_name';

export default class YourPlugin extends BasePlugin {
  id = 'your-plugin-id';
  name = 'Your Plugin Name';
  description = 'Description of your plugin';
  version = '1.0.0';
  author = 'Your Name';
  
  async initialize(context: PluginContext): Promise<void> {
    await super.initialize(context);
    this.context.logger.info('Your Plugin initialized');
  }
  
  getTools(): StructuredTool[] {
    return [
      new YourCustomTool()
    ];
  }
}
```

For adding a tool to an existing plugin, update its `getTools` method:

```typescript
getTools(): StructuredTool[] {
  return [
    new ExistingTool(),
    new YourCustomTool() // Add your new tool here
  ];
}
```

### 6. Update the Agent's Knowledge

Update the agent's personality in `examples/langchain-demo.ts`:

```typescript
const AGENT_PERSONALITY = `
...
- For YourPlugin information:
  * Use 'your_tool_name' to do something specific
    - Requires parameter1 (description)
    - Optional parameter2 (description)
    - Returns useful information about X
...
`;
```

### 7. Run Tests and Build

Test your implementation:
```bash
npm test examples/plugins/YourPlugin/__tests__/index.test.ts
```

Build the project:
```bash
npm run build
```

## Testing Your Plugin

1. Unit Tests: Test each tool's logic in isolation
2. Integration Tests: Test how your plugin works with the agent
3. Error Handling: Test various error scenarios

Run tests:
```bash
npm test examples/plugins/YourPlugin/__tests__/index.test.ts
```

## Integration with LangChain Demo

1. Import your plugin:
```typescript
import YourPlugin from './plugins/YourPlugin';
```

2. Register your plugin:
```typescript
const yourPlugin = new YourPlugin();
await pluginRegistry.registerPlugin(yourPlugin);
```

3. Update the agent's personality with tool information.

## Best Practices

1. **Error Handling**:
   - Wrap API calls in try-catch blocks
   - Provide meaningful error messages
   - Log errors with descriptive context

2. **Documentation**:
   - Use clear tool names and descriptions
   - Document all parameters thoroughly
   - Include examples in your README

3. **Testing**:
   - Write unit tests for all functionality
   - Test error cases and edge cases
   - Mock external dependencies

4. **Code Organization**:
   - Keep tools focused on a single responsibility
   - Use TypeScript interfaces for better type safety
   - Follow existing patterns in the codebase

## Real-World Example: SauceSwap Pool Details Tool

Here's a complete implementation of the `get_sauceswap_pool_details` tool:

```typescript
// Tool implementation
export class GetSauceSwapPoolDetailsTool extends StructuredTool {
  name = 'get_sauceswap_pool_details';
  description = 'Get detailed information about a specific SauceSwap V2 pool by its ID';

  schema = z.object({
    network: z.enum(['mainnet', 'testnet'])
      .default('mainnet')
      .describe('The network to query (mainnet or testnet)'),
    poolId: z.number()
      .min(1)
      .describe('The ID of the pool to get details for')
  });

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      const baseUrl = input.network === 'mainnet' 
        ? 'https://api.saucerswap.finance'
        : 'https://testnet-api.saucerswap.finance';

      const response = await axios.get<PoolDetails>(`${baseUrl}/pools/${input.poolId}`);
      const pool = response.data;

      // Format and return result
      return JSON.stringify({
        poolId: pool.id,
        contractId: pool.contractId,
        lpToken: { /* formatted LP token data */ },
        tokenA: { /* formatted token A data */ },
        tokenB: { /* formatted token B data */ }
      }, null, 2);
    } catch (error) {
      // Error handling logic
      return `Error message`;
    }
  }
}

// Plugin update
export default class SauceSwapPlugin extends BasePlugin {
  // Plugin metadata...
  
  getTools(): StructuredTool[] {
    return [
      new GetSauceSwapPoolsTool(),
      new GetSauceSwapPoolDetailsTool() // Our new tool
    ];
  }
}

// Agent personality update
const AGENT_PERSONALITY = `
...
- For SauceSwap information:
  * Use 'get_sauceswap_pools' to get information about available pools
  * Use 'get_sauceswap_pool_details' to get detailed information about a specific pool
    - Requires a pool ID (number)
    - Returns detailed information about the pool
...
`;
```

For a complete implementation, check out the SauceSwap plugin in the `examples/plugins/SauceSwap` directory. 