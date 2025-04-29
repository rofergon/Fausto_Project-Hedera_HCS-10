import { GetSauceSwapCandlestickTool } from '../index';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GetSauceSwapCandlestickTool', () => {
  let tool: GetSauceSwapCandlestickTool;

  beforeEach(() => {
    tool = new GetSauceSwapCandlestickTool();
    jest.clearAllMocks();
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('get_sauceswap_candlestick');
    expect(tool.description).toContain('Get the latest candlestick data');
  });

  it('should fetch candlestick data successfully', async () => {
    const mockData = {
      id: 2,
      poolId: 1,
      open: 0.0482115316666979,
      high: 0.0482115316666979,
      low: 0.04819650172584323,
      close: 0.04819650172584323,
      avg: 118.56339424557434,
      volume: "0",
      liquidity: "9668737245792",
      volumeUsd: "0",
      liquidityUsd: "4653.53",
      timestampSeconds: 1697618460,
      startTimestampSeconds: 1697616000
    };

    mockedAxios.get.mockResolvedValueOnce({ data: mockData });

    const result = await tool.call({
      poolId: 1,
      interval: 'HOUR'
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.saucerswap.finance/pools/conversionRates/latest/1',
      {
        params: {
          interval: 'HOUR',
          inverted: false
        }
      }
    );

    const parsedResult = JSON.parse(result);
    expect(parsedResult).toMatchObject({
      id: mockData.id,
      poolId: mockData.poolId,
      open: mockData.open,
      high: mockData.high,
      low: mockData.low,
      close: mockData.close,
      avg: mockData.avg,
      volume: mockData.volume,
      liquidity: mockData.liquidity,
      volumeUsd: mockData.volumeUsd,
      liquidityUsd: mockData.liquidityUsd,
      timestampSeconds: mockData.timestampSeconds,
      startTimestampSeconds: mockData.startTimestampSeconds
    });
    expect(parsedResult).toHaveProperty('timestamp');
    expect(parsedResult).toHaveProperty('startTimestamp');
  });

  it('should handle pool not found error', async () => {
    const error = {
      isAxiosError: true,
      response: { status: 404 }
    };
    mockedAxios.get.mockRejectedValueOnce(error);

    const result = await tool.call({
      poolId: 999,
      interval: 'HOUR'
    });

    expect(result).toBe('Pool with ID 999 not found');
  });

  it('should handle general errors', async () => {
    const error = new Error('Network error');
    mockedAxios.get.mockRejectedValueOnce(error);

    const result = await tool.call({
      poolId: 1,
      interval: 'HOUR'
    });

    expect(result).toBe('Error fetching candlestick data: Network error');
  });
}); 