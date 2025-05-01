import { GetSauceSwapPoolDetailsTool } from '../index';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GetSauceSwapPoolDetailsTool', () => {
  let tool: GetSauceSwapPoolDetailsTool;

  beforeEach(() => {
    tool = new GetSauceSwapPoolDetailsTool();
    jest.clearAllMocks();
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('get_sauceswap_pool_details');
    expect(tool.description).toContain('Get detailed information');
  });

  it('should fetch pool details from mainnet by default', async () => {
    const mockPool = {
      id: 1,
      contractId: '0.0.123456',
      lpToken: {
        id: '0.0.123457',
        name: 'SS-LP TOKEN-A - TOKEN-B',
        symbol: 'TOKEN-A - TOKEN-B',
        decimals: 8,
        priceUsd: 1.5
      },
      lpTokenReserve: '1000000',
      tokenA: {
        id: '0.0.123458',
        name: 'Token A',
        symbol: 'TKA',
        decimals: 6,
        priceUsd: 1.0,
        description: 'Test Token A',
        website: 'https://tokena.com'
      },
      tokenReserveA: '500000',
      tokenB: {
        id: '0.0.123459',
        name: 'Token B',
        symbol: 'TKB',
        decimals: 6,
        priceUsd: 2.0,
        description: 'Test Token B',
        website: 'https://tokenb.com'
      },
      tokenReserveB: '250000'
    };

    mockedAxios.get.mockResolvedValueOnce({ data: mockPool });

    const result = await tool._call({ poolId: 1, network: 'mainnet' });
    
    expect(mockedAxios.get).toHaveBeenCalledWith('https://api.saucerswap.finance/pools/1');
    expect(result).toContain('Pool 1 (TKA-TKB) details:');
    expect(result).toContain('Use command "list pools"');
    
    const jsonStart = result.indexOf('{');
    const jsonEnd = result.lastIndexOf('}') + 1;
    const jsonStr = result.substring(jsonStart, jsonEnd);
    const parsed = JSON.parse(jsonStr);
    
    expect(parsed.id).toBe(1);
    expect(parsed.contractId).toBe('0.0.123456');
    expect(parsed.pair).toBe('TKA-TKB');
    expect(parsed.lpToken.symbol).toBe('TOKEN-A - TOKEN-B');
    expect(parsed.tokens.TKA.id).toBe('0.0.123458');
    expect(parsed.tokens.TKB.id).toBe('0.0.123459');
  });

  it('should handle pool not found error', async () => {
    const axiosError = new Error('Pool not found');
    (axiosError as any).isAxiosError = true;
    (axiosError as any).response = { status: 404 };
    
    mockedAxios.get.mockRejectedValueOnce(axiosError);

    const result = await tool._call({ poolId: 20000, network: 'mainnet' });
    expect(result).toBe('Pool with ID 20000 not found');
  });

  it('should handle general errors', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    const result = await tool._call({ poolId: 1, network: 'mainnet' });
    expect(result).toContain('Error fetching pool details: Network error');
  });
}); 