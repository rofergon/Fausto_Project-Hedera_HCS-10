import { GetSauceSwapTokenDetailsTool } from '../index';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GetSauceSwapTokenDetailsTool', () => {
  let tool: GetSauceSwapTokenDetailsTool;

  beforeEach(() => {
    tool = new GetSauceSwapTokenDetailsTool();
    jest.clearAllMocks();
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('get_sauceswap_token_details');
    expect(tool.description).toContain('Get detailed information about a specific token');
  });

  it('should fetch token details from mainnet by default', async () => {
    const mockToken = {
      id: '0.0.731861',
      name: 'SAUCE',
      symbol: 'SAUCE',
      icon: '/images/tokens/sauce.svg',
      decimals: 6,
      price: '36806544',
      priceUsd: 0.01763457,
      dueDiligenceComplete: true,
      isFeeOnTransferToken: false,
      description: 'SaucerSwap is an open source and non-custodial AMM protocol native to Hedera.',
      website: 'https://www.saucerswap.finance/',
      sentinelReport: 'https://sentinel.headstarter.org/details/saucerswap',
      twitterHandle: 'SaucerSwapLabs',
      timestampSecondsLastListingChange: 0
    };

    mockedAxios.get.mockResolvedValueOnce({ data: mockToken });

    const result = await tool._call({ tokenId: '0.0.731861', network: 'mainnet' });
    const parsed = JSON.parse(result);

    expect(mockedAxios.get).toHaveBeenCalledWith('https://api.saucerswap.finance/tokens/0.0.731861');
    expect(parsed.id).toBe('0.0.731861');
    expect(parsed.name).toBe('SAUCE');
    expect(parsed.symbol).toBe('SAUCE');
    expect(parsed.priceUsd).toBe(0.01763457);
  });

  it('should handle token not found error', async () => {
    const mockError = new Error('Request failed with status code 404');
    Object.defineProperty(mockError, 'isAxiosError', { value: true });
    Object.defineProperty(mockError, 'response', { 
      value: { status: 404 }
    });
    
    mockedAxios.get.mockRejectedValueOnce(mockError);

    const result = await tool._call({ tokenId: '0.0.999999', network: 'mainnet' });
    expect(result).toBe('Token with ID 0.0.999999 not found');
  });

  it('should handle general errors', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    const result = await tool._call({ tokenId: '0.0.731861', network: 'mainnet' });
    expect(result).toContain('Error fetching token details: Network error');
  });
}); 