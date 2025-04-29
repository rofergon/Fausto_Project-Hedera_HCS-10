import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios, { AxiosError } from 'axios';

interface CandlestickData {
  id: number;
  poolId: number;
  open: number;
  high: number;
  low: number;
  close: number;
  avg: number;
  volume: string;
  liquidity: string;
  volumeUsd: string;
  liquidityUsd: string;
  timestampSeconds: number;
  startTimestampSeconds: number;
}

export class GetSauceSwapCandlestickTool extends StructuredTool {
  name = 'get_sauceswap_candlestick';
  description = 'Get the latest candlestick data for a specific SauceSwap V2 pool';

  schema = z.object({
    network: z.enum(['mainnet', 'testnet'])
      .default('mainnet')
      .describe('The network to query (mainnet or testnet)'),
    poolId: z.number()
      .min(1)
      .describe('The ID of the pool to get candlestick data for'),
    interval: z.enum(['FIVE', 'MIN', 'HOUR', 'DAY', 'WEEK'])
      .default('HOUR')
      .describe('Data interval (FIVE, MIN, HOUR, DAY, WEEK)'),
    inverted: z.boolean()
      .default(false)
      .describe('Whether to invert the price calculation')
  });

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      const baseUrl = input.network === 'mainnet' 
        ? 'https://api.saucerswap.finance'
        : 'https://testnet-api.saucerswap.finance';

      const response = await axios.get<CandlestickData>(
        `${baseUrl}/pools/conversionRates/latest/${input.poolId}`,
        {
          params: {
            interval: input.interval,
            inverted: input.inverted
          }
        }
      );
      
      const data = response.data;

      return JSON.stringify({
        id: data.id,
        poolId: data.poolId,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        avg: data.avg,
        volume: data.volume,
        liquidity: data.liquidity,
        volumeUsd: data.volumeUsd,
        liquidityUsd: data.liquidityUsd,
        timestampSeconds: data.timestampSeconds,
        startTimestampSeconds: data.startTimestampSeconds,
        // Add some human-readable date information
        timestamp: new Date(data.timestampSeconds * 1000).toISOString(),
        startTimestamp: new Date(data.startTimestampSeconds * 1000).toISOString()
      }, null, 2);
    } catch (error) {
      console.error('[GetSauceSwapCandlestickTool] Error:', error);
      
      // Check if it's a 404 error (not found)
      const axiosError = error as AxiosError;
      if (axiosError.isAxiosError && axiosError.response && axiosError.response.status === 404) {
        return `Pool with ID ${input.poolId} not found`;
      }
      
      return `Error fetching candlestick data: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
} 