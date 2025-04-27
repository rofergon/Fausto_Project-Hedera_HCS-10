import { BasePlugin, PluginContext } from '../../../src/plugins';
import { StructuredTool } from '@langchain/core/tools';
import { GetSauceSwapPoolsTool } from './get_sauceswap_pools';
import { GetSauceSwapPoolDetailsTool } from './get_sauceswap_pool_details';
import { GetSauceSwapTokenDetailsTool } from './get_sauceswap_token_details';

/**
 * SauceSwap Plugin for the Standards Agent Kit
 * Provides tools to interact with the SauceSwap DEX on Hedera network
 */
export default class SauceSwapPlugin extends BasePlugin {
  id = 'sauceswap';
  name = 'SauceSwap Plugin';
  description = 'Provides tools to interact with SauceSwap DEX on Hedera (defaults to mainnet)';
  version = '1.0.0';
  author = 'Standards Agent Kit';
  
  async initialize(context: PluginContext): Promise<void> {
    await super.initialize(context);
    this.context.logger.info('SauceSwap Plugin initialized - Using mainnet by default');
  }
  
  getTools(): StructuredTool[] {
    return [
      new GetSauceSwapPoolsTool(),
      new GetSauceSwapPoolDetailsTool(),
      new GetSauceSwapTokenDetailsTool()
    ];
  }
} 