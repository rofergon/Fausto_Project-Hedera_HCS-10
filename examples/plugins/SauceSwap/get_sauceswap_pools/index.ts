import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  priceUsd: number;
  description?: string;
  website?: string;
  sentinelReport?: string;
  twitterHandle?: string;
  timestampSecondsLastListingChange: number;
}

interface LPToken {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  priceUsd: number;
}

interface PoolInfo {
  id: number;
  contractId: string;
  lpToken: LPToken;
  lpTokenReserve: string;
  tokenA: TokenInfo;
  tokenReserveA: string;
  tokenB: TokenInfo;
  tokenReserveB: string;
}

/**
 * Tool for getting SauceSwap pools information
 */
export class GetSauceSwapPoolsTool extends StructuredTool {
  name = 'get_sauceswap_pools';
  description = 'Get information about SauceSwap pools (defaults to mainnet). Use page parameter to navigate through pools (10 pools per page)';
  
  private readonly MAINNET_URL = 'https://api.saucerswap.finance';
  private readonly TESTNET_URL = 'https://test-api.saucerswap.finance';
  private readonly POOLS_PER_PAGE = 10;
  
  schema = z.object({
    network: z.enum(['mainnet', 'testnet']).default('mainnet').describe('The network to query (defaults to mainnet)'),
    page: z.number().min(1).optional().describe('Page number (10 pools per page, defaults to 1)')
  });
  
  private getApiUrl(network: string = 'mainnet'): string {
    console.log(`[SauceSwap] Using network: ${network}`);
    const url = network === 'mainnet' ? this.MAINNET_URL : this.TESTNET_URL;
    console.log(`[SauceSwap] API URL: ${url}`);
    return url;
  }

  private formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(price);
  }

  private formatNumber(num: string): string {
    return new Intl.NumberFormat('en-US').format(parseInt(num));
  }
  
  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      const network = input.network || 'mainnet';
      const page = input.page || 1;
      console.log(`[SauceSwap] Fetching pools from ${network} (Page ${page})`);
      
      const apiUrl = this.getApiUrl(network);
      console.log(`[SauceSwap] Making request to: ${apiUrl}/pools/known`);
      
      const response = await axios.get<PoolInfo[]>(`${apiUrl}/pools/known`);
      console.log(`[SauceSwap] Received ${response.data.length} pools`);
      
      const startIndex = (page - 1) * this.POOLS_PER_PAGE;
      const endIndex = startIndex + this.POOLS_PER_PAGE;
      const totalPages = Math.ceil(response.data.length / this.POOLS_PER_PAGE);
      
      let result = `SauceSwap Pools on ${network}\n`;
      result += `Total pools available: ${response.data.length}\n`;
      
      if (response.data.length === 0) {
        return result;
      }
      
      if (page > totalPages) {
        return `${result}\nInvalid page number. There are only ${totalPages} pages available (${this.POOLS_PER_PAGE} pools per page).`;
      }
      
      result += `Page ${page} of ${totalPages} (${this.POOLS_PER_PAGE} pools per page)\n\n`;
      
      const pools = response.data.slice(startIndex, endIndex);
      
      pools.forEach((pool, index) => {
        result += `${startIndex + index + 1}. Pool Information:\n`;
        result += `   • Pool ID: ${pool.id}\n`;
        result += `   • Contract ID: ${pool.contractId}\n`;
        result += `   • Pair: ${pool.tokenA.symbol}/${pool.tokenB.symbol}\n\n`;
        
        result += `   LP Token (${pool.lpToken.symbol}):\n`;
        result += `   • Token ID: ${pool.lpToken.id}\n`;
        result += `   • Price: ${this.formatPrice(pool.lpToken.priceUsd)}\n`;
        result += `   • Reserve: ${this.formatNumber(pool.lpTokenReserve)}\n\n`;
        
        result += `   Token A (${pool.tokenA.symbol}):\n`;
        result += `   • Token ID: ${pool.tokenA.id}\n`;
        result += `   • Price: ${this.formatPrice(pool.tokenA.priceUsd)}\n`;
        result += `   • Reserve: ${this.formatNumber(pool.tokenReserveA)}\n`;
        if (pool.tokenA.website) {
          result += `   • Website: ${pool.tokenA.website}\n`;
        }
        if (pool.tokenA.description) {
          result += `   • Description: ${pool.tokenA.description}\n`;
        }
        result += '\n';
        
        result += `   Token B (${pool.tokenB.symbol}):\n`;
        result += `   • Token ID: ${pool.tokenB.id}\n`;
        result += `   • Price: ${this.formatPrice(pool.tokenB.priceUsd)}\n`;
        result += `   • Reserve: ${this.formatNumber(pool.tokenReserveB)}\n`;
        if (pool.tokenB.website) {
          result += `   • Website: ${pool.tokenB.website}\n`;
        }
        if (pool.tokenB.description) {
          result += `   • Description: ${pool.tokenB.description}\n`;
        }
        result += '\n';
        
        result += `   ----------------------------------------\n\n`;
      });

      if (page < totalPages) {
        result += `Use page=${page + 1} to see the next set of pools.\n`;
      }
      
      return result;
    } catch (error) {
      console.error('[SauceSwap] Error:', error);
      return `Error fetching SauceSwap pools: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
} 