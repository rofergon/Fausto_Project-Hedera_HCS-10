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
 * 
 * Optimized to return concise pool information:
 * - Basic pool identification (ID, pair)
 * - Price information for tokens
 * - Compact tabular format
 * - Limited to essential trading data
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
      
      let result = `SauceSwap Pools (${network}) - Page ${page}/${totalPages} (Total: ${response.data.length})\n\n`;
      
      if (response.data.length === 0) {
        return result + "No pools available.";
      }
      
      if (page > totalPages) {
        return `Invalid page number. There are only ${totalPages} pages available.`;
      }
      
      const pools = response.data.slice(startIndex, endIndex);
      
      // Table header
      result += "ID | Pair | Token Prices | LP Price\n";
      result += "---|------|-------------|--------\n";
      
      pools.forEach((pool) => {
        const tokenAPriceFormatted = this.formatPrice(pool.tokenA.priceUsd);
        const tokenBPriceFormatted = this.formatPrice(pool.tokenB.priceUsd);
        const lpPriceFormatted = this.formatPrice(pool.lpToken.priceUsd);
        
        result += `${pool.id} | ${pool.tokenA.symbol}-${pool.tokenB.symbol} | ` +
                 `${pool.tokenA.symbol}: ${tokenAPriceFormatted}, ${pool.tokenB.symbol}: ${tokenBPriceFormatted} | ${lpPriceFormatted}\n`;
      });
      
      result += `\nUse command "pool details ${pools[0].id}" to see detailed information about a specific pool.`;
      
      return result;
    } catch (error) {
      console.error('[SauceSwap] Error:', error);
      return `Error fetching SauceSwap pools: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
} 