# Creating Custom Tools for Standards Agent Kit

This guide explains how to create custom tools and plugins for the Standards Agent Kit. We'll use the SauceSwap plugin as an example to demonstrate the process.

## Table of Contents
- [Plugin Structure](#plugin-structure)
- [Creating a New Tool](#creating-a-new-tool)
- [Creating a Plugin](#creating-a-plugin)
- [Testing Your Plugin](#testing-your-plugin)
- [Integration with LangChain Demo](#integration-with-langchain-demo)

## Plugin Structure

A typical plugin structure looks like this:

```
examples/plugins/YourPlugin/
├── __tests__/              # Test files
│   └── index.test.ts       # Unit tests for your plugin
├── index.ts                # Main plugin file
└── README.md              # Plugin documentation
```

## Creating a New Tool

1. First, create a new tool class that extends `StructuredTool` from LangChain:

```typescript
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

class YourCustomTool extends StructuredTool {
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

## Creating a Plugin

1. Create a plugin class that extends `BasePlugin`:

```typescript
import { BasePlugin, PluginContext } from '../../../src/plugins';

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

## Example: SauceSwap Plugin

Here's a real example using the SauceSwap plugin:

```typescript
// Tool definition
class GetSauceSwapPoolsTool extends StructuredTool {
  name = 'get_sauceswap_pools';
  description = 'Get information about SauceSwap V2 pools';
  
  private readonly POOLS_PER_PAGE = 5;
  
  schema = z.object({
    network: z.enum(['mainnet', 'testnet'])
      .default('mainnet')
      .describe('The network to query'),
    page: z.number().min(1)
      .optional()
      .describe('Page number (5 pools per page)')
  });
  
  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      // API call and data processing
      const response = await axios.get<PoolInfo[]>(`${apiUrl}/v2/pools`);
      // Format and return results
      return formattedResult;
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }
}

// Plugin definition
export default class SauceSwapPlugin extends BasePlugin {
  id = 'sauceswap';
  name = 'SauceSwap Plugin';
  description = 'Provides tools to interact with SauceSwap DEX';
  
  getTools(): StructuredTool[] {
    return [new GetSauceSwapPoolsTool()];
  }
}
```

## Testing Your Plugin

1. Create test files in the `__tests__` directory:

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

  // Add more test cases for your tool's functionality
});
```

2. Run tests using:
```bash
npm test examples/plugins/YourPlugin/__tests__/index.test.ts
```

## Integration with LangChain Demo

1. Import your plugin in `examples/langchain-demo.ts`:
```typescript
import YourPlugin from './plugins/YourPlugin';
```

2. Register your plugin in the initialization section:
```typescript
const yourPlugin = new YourPlugin();
await pluginRegistry.registerPlugin(yourPlugin);
```

3. Update the `AGENT_PERSONALITY` to include information about your tool:
```typescript
const AGENT_PERSONALITY = `
...
You also have access to:
- Your Plugin tools: Description of what your tools do and how to use them
...
`;
```

## Best Practices

1. **Error Handling**:
   - Always wrap API calls in try-catch blocks
   - Provide meaningful error messages
   - Log errors for debugging

2. **Documentation**:
   - Provide clear descriptions for your tools
   - Document all parameters
   - Include examples in your plugin's README

3. **Testing**:
   - Write comprehensive unit tests
   - Test error cases
   - Mock external dependencies

4. **Code Organization**:
   - Keep tools focused and single-purpose
   - Use TypeScript interfaces for data structures
   - Follow the existing plugin structure

## Example Usage

Once your plugin is integrated, it can be used in the LangChain demo like this:

```
You: Use your_tool_name with param1="example"
Agent: Let me fetch that information for you...
[Tool uses your custom implementation]
Here are the results: [formatted output]
```

Remember to rebuild the project after making changes:
```bash
npm run build
```

For more examples, check out the existing plugins in the `examples/plugins` directory. 