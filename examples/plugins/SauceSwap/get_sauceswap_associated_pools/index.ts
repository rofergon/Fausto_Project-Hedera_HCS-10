import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

// Interface defining token information structure
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
}

// Interface defining pool information structure
interface PoolInfo {
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

// Tool for retrieving pools associated with a specific token on SauceSwap
export class GetSauceSwapAssociatedPoolsTool extends StructuredTool {
  name = 'get_sauceswap_associated_pools';
  description = 'Get all pools associated with a specific token ID on SauceSwap';

  // Define input schema with Zod
  schema = z.object({
    tokenId: z.string().describe('The token ID to get associated pools for (e.g., "0.0.731861")'),
    network: z.enum(['mainnet', 'testnet'])
      .default('mainnet')
      .describe('The network to query (mainnet or testnet)')
  });

  // Main method that fetches and processes pool data
  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      // Select API URL based on network
      const baseUrl = input.network === 'mainnet' 
        ? 'https://api.saucerswap.finance'
        : 'https://testnet-api.saucerswap.finance';

      // Fetch pools data from API
      const response = await axios.get<PoolInfo[]>(`${baseUrl}/tokens/associated-pools/${input.tokenId}`);
      const pools = response.data;

      if (!pools || pools.length === 0) {
        return `No pools found containing token ${input.tokenId}`;
      }

      // Transform the data into a more readable format
      const formattedPools = pools.map(pool => ({
        poolId: pool.id,
        contractId: pool.contractId,
        lpToken: {
          id: pool.lpToken.id,
          name: pool.lpToken.name,
          symbol: pool.lpToken.symbol,
          priceUsd: pool.lpToken.priceUsd,
          totalReserve: pool.lpTokenReserve
        },
        tokenA: {
          id: pool.tokenA.id,
          name: pool.tokenA.name,
          symbol: pool.tokenA.symbol,
          priceUsd: pool.tokenA.priceUsd,
          reserve: pool.tokenReserveA
        },
        tokenB: {
          id: pool.tokenB.id,
          name: pool.tokenB.name,
          symbol: pool.tokenB.symbol,
          priceUsd: pool.tokenB.priceUsd,
          reserve: pool.tokenReserveB
        }
      }));

      return JSON.stringify(formattedPools, null, 2);
    } catch (error) {
      // Handle errors, including 404 for tokens with no pools
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return `Token ${input.tokenId} not found or has no associated pools`;
      }
      console.error('[GetSauceSwapAssociatedPoolsTool] Error:', error);
      throw new Error(`Error fetching associated pools: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 