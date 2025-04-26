import { BasePlugin, PluginContext } from '../../../src/plugins';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

interface TokenInfo {
  decimals: number;
  icon: string;
  id: string;
  name: string;
  price: string;
  priceUsd: number;
  symbol: string;
  dueDiligenceComplete: boolean;
  isFeeOnTransferToken: boolean;
}

interface PoolInfo {
  id: number;
  contractId: string;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  amountA: string;
  amountB: string;
  fee: number;
  sqrtRatioX96: string;
  tickCurrent: number;
  liquidity: string;
}

/**
 * Tool for getting SauceSwap V2 pools information
 */
class GetSauceSwapPoolsTool extends StructuredTool {
  name = 'get_sauceswap_pools';
  description = 'Get information about all available SauceSwap V2 pools';
  
  schema = z.object({
    network: z.enum(['mainnet', 'testnet']).describe('The network to query (mainnet or testnet)')
  });
  
  private getApiUrl(network: string): string {
    return network === 'mainnet' 
      ? 'https://api.saucerswap.finance'
      : 'https://test-api.saucerswap.finance';
  }
  
  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      const apiUrl = this.getApiUrl(input.network);
      const response = await axios.get<PoolInfo[]>(`${apiUrl}/v2/pools`);
      
      const pools = response.data;
      let result = `Found ${pools.length} SauceSwap V2 pools:\n\n`;
      
      pools.forEach(pool => {
        result += `Pool #${pool.id} (${pool.contractId}):\n`;
        result += `- Token A: ${pool.tokenA.symbol} (${pool.tokenA.id})\n`;
        result += `  Amount: ${pool.amountA} | Price USD: $${pool.tokenA.priceUsd}\n`;
        result += `- Token B: ${pool.tokenB.symbol} (${pool.tokenB.id})\n`;
        result += `  Amount: ${pool.amountB} | Price USD: $${pool.tokenB.priceUsd}\n`;
        result += `- Fee: ${pool.fee / 10000}%\n`;
        result += `- Liquidity: ${pool.liquidity}\n\n`;
      });
      
      return result;
    } catch (error) {
      return `Error fetching SauceSwap pools: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/**
 * SauceSwap Plugin for the Standards Agent Kit
 */
export default class SauceSwapPlugin extends BasePlugin {
  id = 'sauceswap';
  name = 'SauceSwap Plugin';
  description = 'Provides tools to interact with SauceSwap DEX';
  version = '1.0.0';
  author = 'Standards Agent Kit';
  
  async initialize(context: PluginContext): Promise<void> {
    await super.initialize(context);
    this.context.logger.info('SauceSwap Plugin initialized');
  }
  
  getTools(): StructuredTool[] {
    return [
      new GetSauceSwapPoolsTool()
    ];
  }
} 