import axios from 'axios';
import {
  calculateOptimalInterval,
  calculateTimeRanges,
  formatTimestamp,
  type CandlestickConfig,
  type TimeRange
} from './timeCalculations';

export interface Candlestick {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  avg: number;
  volume: string;
  liquidity: string;
  volumeUsd: string;
  liquidityUsd: string;
}

export interface CandlestickChartData {
  poolId: number;
  timeRange: string;
  interval: string;
  candlesticks: Candlestick[];
  summary: {
    totalCandles: number;
    startTime: string;
    endTime: string;
    highestPrice: number;
    lowestPrice: number;
    totalVolume: string;
    averageLiquidity: string;
  };
}

export class CandlestickFetcher {
  private baseUrl: string;

  constructor(network: 'mainnet' | 'testnet' = 'mainnet') {
    this.baseUrl = network === 'mainnet'
      ? 'https://api.saucerswap.finance'
      : 'https://test-api.saucerswap.finance';
  }

  /**
   * Fetch candlestick data for a specific time range
   */
  private async fetchCandlesticks(
    poolId: number,
    from: number,
    to: number,
    interval: string,
    inverted: boolean = false
  ): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/pools/conversionRates/${poolId}`,
        {
          params: {
            from,
            to,
            interval,
            inverted
          }
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Error fetching candlestick data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process raw candlestick data into a standardized format
   */
  private processCandlestick(data: any): Candlestick {
    return {
      timestamp: data.timestampSeconds,
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
      avg: data.avg,
      volume: data.volume,
      liquidity: data.liquidity,
      volumeUsd: data.volumeUsd,
      liquidityUsd: data.liquidityUsd
    };
  }

  /**
   * Calculate summary statistics for the candlestick data
   */
  private calculateSummary(candlesticks: Candlestick[], timeRange: string): CandlestickChartData['summary'] {
    const startTime = formatTimestamp(candlesticks[0].timestamp);
    const endTime = formatTimestamp(candlesticks[candlesticks.length - 1].timestamp);
    
    const prices = candlesticks.flatMap(c => [c.high, c.low]);
    const highestPrice = Math.max(...prices);
    const lowestPrice = Math.min(...prices);
    
    const totalVolume = candlesticks.reduce((sum, c) => sum + parseFloat(c.volumeUsd), 0).toString();
    const avgLiquidity = (candlesticks.reduce((sum, c) => sum + parseFloat(c.liquidityUsd), 0) / candlesticks.length).toString();

    return {
      totalCandles: candlesticks.length,
      startTime,
      endTime,
      highestPrice,
      lowestPrice,
      totalVolume,
      averageLiquidity: avgLiquidity
    };
  }

  /**
   * Get candlestick chart data for a specific pool and time range
   */
  public async getChartData(
    poolId: number,
    timeRange: string,
    inverted: boolean = false
  ): Promise<CandlestickChartData> {
    // Calculate optimal interval and time ranges
    const config: CandlestickConfig = calculateOptimalInterval(timeRange);
    const range: TimeRange = calculateTimeRanges(timeRange);

    // Fetch data
    const rawData = await this.fetchCandlesticks(
      poolId,
      range.from,
      range.to,
      config.interval,
      inverted
    );

    // Process candlesticks
    const candlesticks = Array.isArray(rawData) 
      ? rawData.map(d => this.processCandlestick(d))
      : [this.processCandlestick(rawData)];

    // Calculate summary
    const summary = this.calculateSummary(candlesticks, timeRange);

    return {
      poolId,
      timeRange,
      interval: config.interval,
      candlesticks,
      summary
    };
  }
} 