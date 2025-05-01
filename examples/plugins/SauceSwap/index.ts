import { BasePlugin, PluginContext } from '../../../src/plugins';
import { StructuredTool } from '@langchain/core/tools';
import { GetSauceSwapPoolsTool } from './get_sauceswap_pools';
import { GetSauceSwapPoolDetailsTool } from './get_sauceswap_pool_details';
import { GetSauceSwapTokenDetailsTool } from './get_sauceswap_token_details';
import { GetSauceSwapAssociatedPoolsTool } from './get_sauceswap_associated_pools';
import { GetSauceSwapChartTool } from './CandlestickPlugin';

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
  
  private network: 'mainnet' | 'testnet' = 'mainnet';
  private chartOutputDir: string = './charts';
  private chartTool: GetSauceSwapChartTool | null = null;
  
  async initialize(context: PluginContext): Promise<void> {
    await super.initialize(context);
    this.network = context.config?.network || 'mainnet';
    this.chartOutputDir = context.config?.chartOutputDir || './charts';
    
    // Create chart tool with client for Hedera inscriptions
    this.chartTool = new GetSauceSwapChartTool(this.network, this.chartOutputDir);
    
    // Pass the HCS10Client to the tool so it can access credentials
    if (context.client) {
      this.chartTool.setClient(context.client);
    }
    
    this.context.logger.info('SauceSwap Plugin initialized - Using mainnet by default');
  }
  
  getTools(): StructuredTool[] {
    return [
      new GetSauceSwapPoolsTool(),
      new GetSauceSwapPoolDetailsTool(),
      new GetSauceSwapTokenDetailsTool(),
      new GetSauceSwapAssociatedPoolsTool(),
      this.chartTool || new GetSauceSwapChartTool(this.network, this.chartOutputDir)
    ];
  }
} 