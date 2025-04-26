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

      return JSON.stringify({
        poolId: pool.id,
        contractId: pool.contractId,
        lpToken: {
          id: pool.lpToken.id,
          name: pool.lpToken.name,
          symbol: pool.lpToken.symbol,
          decimals: pool.lpToken.decimals,
          priceUsd: pool.lpToken.priceUsd,
          totalReserve: pool.lpTokenReserve
        },
        tokenA: {
          id: pool.tokenA.id,
          name: pool.tokenA.name,
          symbol: pool.tokenA.symbol,
          decimals: pool.tokenA.decimals,
          priceUsd: pool.tokenA.priceUsd,
          reserve: pool.tokenReserveA,
          website: pool.tokenA.website,
          description: pool.tokenA.description
        },
        tokenB: {
          id: pool.tokenB.id,
          name: pool.tokenB.name,
          symbol: pool.tokenB.symbol,
          decimals: pool.tokenB.decimals,
          priceUsd: pool.tokenB.priceUsd,
          reserve: pool.tokenReserveB,
          website: pool.tokenB.website,
          description: pool.tokenB.description
        }
      }, null, 2);
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