import axios from 'axios';
import { GetSauceSwapPoolsTool } from '../index';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

interface MockTokenInfo {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  price: string;
  priceUsd: number;
  icon: string;
  dueDiligenceComplete: boolean;
  isFeeOnTransferToken: boolean;
}

interface MockPoolInfo {
  id: number;
  contractId: string;
  tokenA: MockTokenInfo;
  tokenB: MockTokenInfo;
  amountA: string;
  amountB: string;
  fee: number;
  sqrtRatioX96: string;
  tickCurrent: number;
  liquidity: string;
}

describe('GetSauceSwapPoolsTool', () => {
  let tool: GetSauceSwapPoolsTool;

  beforeEach(() => {
    tool = new GetSauceSwapPoolsTool();
    jest.clearAllMocks();
  });

  const mockTokenA: MockTokenInfo = {
    id: '0.0.111111',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    price: '1.00',
    priceUsd: 1.00,
    icon: '',
    dueDiligenceComplete: true,
    isFeeOnTransferToken: false
  };

  const mockTokenB: MockTokenInfo = {
    id: '0.0.222222',
    symbol: 'HBAR',
    name: 'HBAR',
    decimals: 8,
    price: '0.07',
    priceUsd: 0.07,
    icon: '',
    dueDiligenceComplete: true,
    isFeeOnTransferToken: false
  };

  const mockPoolData: MockPoolInfo[] = [
    {
      id: 1,
      contractId: '0.0.123456',
      tokenA: mockTokenA,
      tokenB: mockTokenB,
      amountA: '1000000',
      amountB: '2000000',
      fee: 500, // 0.05%
      sqrtRatioX96: '1234567890',
      tickCurrent: 0,
      liquidity: '5000000'
    },
    {
      id: 2,
      contractId: '0.0.123457',
      tokenA: mockTokenA,
      tokenB: mockTokenB,
      amountA: '3000000',
      amountB: '4000000',
      fee: 3000, // 0.3%
      sqrtRatioX96: '1234567891',
      tickCurrent: 1,
      liquidity: '7000000'
    }
  ];

  describe('basic functionality', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('get_sauceswap_pools');
      expect(tool.description).toContain('Get information about SauceSwap V2 pools');
    });

    it('should use mainnet URL by default', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: mockPoolData });
      await tool._call({ network: 'mainnet' });
      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.saucerswap.finance/pools/known');
    });

    it('should use testnet URL when specified', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: mockPoolData });
      await tool._call({ network: 'testnet' });
      expect(mockedAxios.get).toHaveBeenCalledWith('https://testnet-api.saucerswap.finance/pools/known');
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      // Create an array of 7 mock pool objects for pagination testing
      const extendedMockData = Array(7).fill(null).map((_, index) => ({
        id: index + 1,
        contractId: `0.0.${123456 + index}`,
        lpToken: {
          id: `0.0.${654321 + index}`,
          name: `LP Token ${index + 1}`,
          symbol: `LP-${index + 1}`,
          decimals: 8,
          priceUsd: 1.5 + index * 0.1
        },
        lpTokenReserve: `${1000000 + index * 100000}`,
        tokenA: {
          id: '0.0.111111',
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
          priceUsd: 1.00,
          timestampSecondsLastListingChange: 0
        },
        tokenReserveA: `${500000 + index * 50000}`,
        tokenB: {
          id: '0.0.222222',
          name: 'HBAR',
          symbol: 'HBAR',
          decimals: 8,
          priceUsd: 0.07,
          timestampSecondsLastListingChange: 0
        },
        tokenReserveB: `${700000 + index * 70000}`
      }));
      mockedAxios.get.mockResolvedValue({ data: extendedMockData });
    });

    it('should return first page by default', async () => {
      const result = await tool._call({ network: 'mainnet' });
      expect(result).toContain('Page 1/');
      expect(result).toContain('USDC-HBAR');
      expect(result).toContain('ID | Pair');
    });

    it('should return correct page when specified', async () => {
      const result = await tool._call({ network: 'mainnet', page: 2 });
      expect(result).toContain('Page 2/');
    });

    it('should handle invalid page numbers', async () => {
      const result = await tool._call({ network: 'mainnet', page: 99 });
      expect(result).toContain('Invalid page number');
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('API Error'));
      const result = await tool._call({ network: 'mainnet' });
      expect(result).toContain('Error fetching SauceSwap pools');
    });

    it('should handle empty pool list', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: [] });
      const result = await tool._call({ network: 'mainnet' });
      expect(result).toContain('No pools available');
    });
  });

  describe('data formatting', () => {
    beforeEach(() => {
      const mockPool = {
        id: 1,
        contractId: '0.0.123456',
        lpToken: {
          id: '0.0.654321',
          name: 'LP Token',
          symbol: 'LP-1',
          decimals: 8,
          priceUsd: 1.5
        },
        lpTokenReserve: '1000000',
        tokenA: {
          id: '0.0.111111',
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
          priceUsd: 1.00,
          timestampSecondsLastListingChange: 0
        },
        tokenReserveA: '500000',
        tokenB: {
          id: '0.0.222222',
          name: 'HBAR',
          symbol: 'HBAR',
          decimals: 8,
          priceUsd: 0.07,
          timestampSecondsLastListingChange: 0
        },
        tokenReserveB: '700000'
      };
      
      mockedAxios.get.mockResolvedValueOnce({ data: [mockPool] });
    });

    it('should format prices correctly', async () => {
      const result = await tool._call({ network: 'mainnet' });
      expect(result).toContain('$1.00'); // formatted price
      expect(result).toContain('$0.07'); // formatted price
    });

    it('should display data in tabular format', async () => {
      const result = await tool._call({ network: 'mainnet' });
      expect(result).toContain('ID | Pair | Token Prices | LP Price');
      expect(result).toContain('USDC: $1.00');
      expect(result).toContain('USDC-HBAR');
    });
  });
}); 