import { GetSauceSwapAssociatedPoolsTool } from '../index';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GetSauceSwapAssociatedPoolsTool', () => {
  let tool: GetSauceSwapAssociatedPoolsTool;

  beforeEach(() => {
    tool = new GetSauceSwapAssociatedPoolsTool();
    jest.clearAllMocks();
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('get_sauceswap_associated_pools');
    expect(tool.description).toContain('Get all pools associated with a specific token ID');
  });

  it('should fetch and format associated pools successfully', async () => {
    const mockResponse = {
      data: [{
        id: 213,
        contractId: "0.0.1465865",
        lpToken: {
          id: "0.0.1465866",
          name: "SS-LP SAUCE - XSAUCE",
          symbol: "SAUCE - XSAUCE",
          decimals: 8,
          priceUsd: 3.7760690082569948
        },
        lpTokenReserve: "23490447137584",
        tokenA: {
          id: "0.0.731861",
          name: "SAUCE",
          symbol: "SAUCE",
          decimals: 6,
          priceUsd: 0.01760954
        },
        tokenReserveA: "25185652046087",
        tokenB: {
          id: "0.0.1460200",
          name: "xSAUCE",
          symbol: "XSAUCE",
          decimals: 6,
          priceUsd: 0.01959459
        },
        tokenReserveB: "22634187941347"
      }]
    };

    mockedAxios.get.mockResolvedValueOnce(mockResponse);

    const result = await tool.call({
      tokenId: "0.0.731861",
      network: "mainnet"
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.saucerswap.finance/tokens/associated-pools/0.0.731861'
    );

    const parsedResult = JSON.parse(result);
    expect(parsedResult).toHaveLength(1);
    expect(parsedResult[0]).toHaveProperty('poolId', 213);
    expect(parsedResult[0]).toHaveProperty('contractId', '0.0.1465865');
    expect(parsedResult[0].lpToken).toHaveProperty('name', 'SS-LP SAUCE - XSAUCE');
  });

  it('should handle no pools found', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });

    const result = await tool.call({
      tokenId: "0.0.999999",
      network: "mainnet"
    });

    expect(result).toBe('No pools found containing token 0.0.999999');
  });

  it('should handle network errors', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    await expect(tool.call({
      tokenId: "0.0.731861",
      network: "mainnet"
    })).rejects.toThrow('Error fetching associated pools: Network error');
  });

  it('should handle 404 errors gracefully', async () => {
    mockedAxios.get.mockRejectedValueOnce({
      response: { status: 404 },
      isAxiosError: true
    });

    const result = await tool.call({
      tokenId: "0.0.999999",
      network: "mainnet"
    });

    expect(result).toBe('Token 0.0.999999 not found or has no associated pools');
  });
}); 