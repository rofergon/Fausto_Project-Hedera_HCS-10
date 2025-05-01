/**
 * This tool fetches detailed information about a SauceSwap pool by ID.
 * 
 * The response format has been optimized to:
 * 1. Use dynamic keys for tokens based on their symbols ([tokenA.symbol], [tokenB.symbol])
 * 2. Create a simple "pair" field that shows the trading pair (e.g., "HBAR-USDC")
 * 3. Remove redundant information like token names and decimals that aren't needed
 *    for most use cases
 * 4. Flatten nested structures where possible to make data more accessible
 * 
 * This keeps all important trading information while reducing payload size and
 * making it easier for the AI to understand the pool structure.
 */

import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios, { AxiosError } from 'axios';

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

interface PoolDetails {
  id: number;
  contractId: string;
  lpToken: {
    id: string;
    name: string;
    symbol: string;
    decimals: number;
    priceUsd: number;
  };
  lpTokenReserve: string;
  tokenA: TokenInfo;
  tokenReserveA: string;
  tokenB: TokenInfo;
  tokenReserveB: string;
}

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
      
      const result = JSON.stringify({
        id: pool.id,
        contractId: pool.contractId,
        pair: `${pool.tokenA.symbol}-${pool.tokenB.symbol}`,
        lpToken: {
          symbol: pool.lpToken.symbol,
          priceUsd: pool.lpToken.priceUsd,
          totalReserve: pool.lpTokenReserve
        },
        tokens: {
          [pool.tokenA.symbol]: {
            id: pool.tokenA.id,
            priceUsd: pool.tokenA.priceUsd,
            reserve: pool.tokenReserveA,
            website: pool.tokenA.website
          },
          [pool.tokenB.symbol]: {
            id: pool.tokenB.id,
            priceUsd: pool.tokenB.priceUsd,
            reserve: pool.tokenReserveB,
            website: pool.tokenB.website
          }
        }
      }, null, 2);
      
      return `Pool ${pool.id} (${pool.tokenA.symbol}-${pool.tokenB.symbol}) details:\n\n${result}\n\nUse command "list pools" to see all available pools.`;
    } catch (error) {
      console.error('[GetSauceSwapPoolDetailsTool] Error:', error);
      
      // Check if it's a 404 error (not found)
      const axiosError = error as AxiosError;
      if (axiosError.isAxiosError && axiosError.response && axiosError.response.status === 404) {
        return `Pool with ID ${input.poolId} not found`;
      }
      
      return `Error fetching pool details: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
} 