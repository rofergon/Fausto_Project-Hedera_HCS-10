import { BasePlugin, PluginContext } from '../../../../src/plugins';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

/**
 * Tool for getting candlestick data from SauceSwap
 */
class GetSauceSwapCandlestickTool extends StructuredTool {
  name = 'get_sauceswap_candlestick';
  description = 'Get historical candlestick data for a SauceSwap pool';
  
  schema = z.object({
    poolId: z.number().describe('The ID of the pool to get candlestick data for'),
    from: z.number().optional().describe('Start time in Unix seconds'),
    to: z.number().optional().describe('End time in Unix seconds'),
    interval: z.enum(['FIVE', 'MIN', 'HOUR', 'DAY', 'WEEK']).optional().describe('Data interval (FIVE=5min, MIN=1min, HOUR=1hour, DAY=1day, WEEK=1week)'),
    inverted: z.boolean().optional().describe('Whether to invert the price calculation'),
    network: z.enum(['mainnet', 'testnet']).optional().describe('Network to use (mainnet or testnet)')
  });
  
  private getApiUrl(network: string = 'mainnet'): string {
    return network === 'mainnet' 
      ? 'https://api.saucerswap.finance'
      : 'https://test-api.saucerswap.finance';
  }
  
  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      const network = input.network || 'mainnet';
      const baseUrl = this.getApiUrl(network);
      const now = Math.floor(Date.now() / 1000);
      
      const params = {
        from: input.from || now - 24 * 60 * 60, // Default to last 24 hours
        to: input.to || now,
        interval: input.interval || 'HOUR',
        inverted: input.inverted || false
      };
      
      const response = await axios.get(
        `${baseUrl}/pools/conversionRates/${input.poolId}`,
        { params }
      );
      
      const data = response.data;
      
      // Format the response in a readable way
      const timestamp = new Date(data.timestampSeconds * 1000).toLocaleString();
      const startTimestamp = new Date(data.startTimestampSeconds * 1000).toLocaleString();
      
      return `Candlestick data for pool ${input.poolId}:
Time: ${timestamp}
Start Time: ${startTimestamp}
Open: ${data.open}
High: ${data.high}
Low: ${data.low}
Close: ${data.close}
Average: ${data.avg}
Volume: ${data.volume}
Liquidity: ${data.liquidity}
Volume USD: ${data.volumeUsd}
Liquidity USD: ${data.liquidityUsd}`;
    } catch (error) {
      return `Error fetching candlestick data: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/**
 * SauceSwap Candlestick Plugin
 */
export default class SauceSwapCandlestickPlugin extends BasePlugin {
  id = 'sauceswap-candlestick';
  name = 'SauceSwap Candlestick Plugin';
  description = 'Provides tools to access SauceSwap candlestick data';
  version = '1.0.0';
  author = 'Your Name';
  
  async initialize(context: PluginContext): Promise<void> {
    await super.initialize(context);
  }
  
  getTools(): StructuredTool[] {
    return [
      new GetSauceSwapCandlestickTool()
    ];
  }
} 