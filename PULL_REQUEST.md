# Plugin System for Standards Agent Kit

## Overview
This PR adds a plugin system to the Standards Agent Kit, enabling contributors to easily add their own integrations for DeFi protocols, web services, and other functionality.

## Features
- **Flexible Plugin Architecture**: A modular design that allows for easy extension
- **Standardized Plugin Interface**: Clear contract for all plugins to implement
- **Plugin Registry**: Central management of plugin registration and lifecycle
- **Plugin Loader**: Dynamic discovery and loading of plugins
- **Base Plugin Class**: Simplifies plugin development with common functionality

## Sample Plugins
Two example plugins are included to demonstrate the system:

1. **Weather API Plugin**: Shows integration with external web services
   - Provides tools for accessing weather data
   - Demonstrates API integration patterns

2. **DeFi Integration Plugin**: Shows Hedera-specific functionality
   - Uses CoinGecko for price data (no hardcoded API keys)
   - Demonstrates token operations and balance checking

## Implementation Details
- All code is written in TypeScript with proper typing
- No hardcoded credentials or API keys
- Compatible with existing CLI and LangChain demos
- Comprehensive test coverage with Jest and @swc/jest

## How to Use
Developers can create plugins by:
1. Extending the BasePlugin class
2. Implementing the required interface methods
3. Creating a plugin.json manifest
4. Registering the plugin with the PluginRegistry

## Testing
All tests are passing with the following test suites:
- PluginRegistry tests
- BasePlugin tests
- PluginLoader tests

## Documentation
The implementation includes:
- Code comments explaining key components
- Example plugins as reference implementations
- This PR description as high-level documentation

## Future Improvements
- Add plugin versioning support
- Implement plugin dependency resolution
- Add more example plugins for common use cases
