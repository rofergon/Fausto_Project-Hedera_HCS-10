import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

interface TokenDetails {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  price: string;
  priceUsd: number;
  dueDiligenceComplete: boolean;
  isFeeOnTransferToken: boolean;
  description?: string;
  website?: string;
  sentinelReport?: string;
  twitterHandle?: string;
  timestampSecondsLastListingChange: number;
}

export class GetSauceSwapTokenDetailsTool extends StructuredTool {
  name = 'get_sauceswap_token_details';
  description = 'Get detailed information about a specific token on SauceSwap by its ID';

  schema = z.object({
    network: z.enum(['mainnet', 'testnet'])
      .default('mainnet')
      .describe('The network to query (mainnet or testnet)'),
    tokenId: z.string()
      .describe('The ID of the token to get details for (e.g., "0.0.731861")')
  });

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      const baseUrl = input.network === 'mainnet' 
        ? 'https://api.saucerswap.finance'
        : 'https://testnet-api.saucerswap.finance';

      const response = await axios.get<TokenDetails>(`${baseUrl}/tokens/${input.tokenId}`);
      const token = response.data;

      return JSON.stringify({
        id: token.id,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        priceUsd: token.priceUsd,
        price: token.price,
        description: token.description || 'No description available',
        dueDiligenceComplete: token.dueDiligenceComplete,
        isFeeOnTransferToken: token.isFeeOnTransferToken,
        website: token.website || 'Not available',
        sentinelReport: token.sentinelReport || 'Not available',
        twitterHandle: token.twitterHandle || 'Not available',
        icon: token.icon || 'Not available'
      }, null, 2);
    } catch (error) {
      console.error('[GetSauceSwapTokenDetailsTool] Error:', error);
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return `Token with ID ${input.tokenId} not found`;
      }
      return `Error fetching token details: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
} 