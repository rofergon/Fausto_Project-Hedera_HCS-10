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
      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.saucerswap.finance/v2/pools');
    });

    it('should use testnet URL when specified', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: mockPoolData });
      await tool._call({ network: 'testnet' });
      expect(mockedAxios.get).toHaveBeenCalledWith('https://test-api.saucerswap.finance/v2/pools');
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      // Create an array of 7 mock pools for pagination testing
      const extendedMockData: MockPoolInfo[] = Array(7).fill(null).map((_, index) => ({
        ...mockPoolData[0],
        id: index + 1,
        contractId: `0.0.${123456 + index}`
      }));
      mockedAxios.get.mockResolvedValue({ data: extendedMockData });
    });

    it('should return first page by default', async () => {
      const result = await tool._call({ network: 'mainnet' });
      expect(result).toContain('Page 1 of');
      expect(result).toContain('Pool ID: 1');
      expect(result).not.toContain('Pool ID: 6');
    });

    it('should return correct page when specified', async () => {
      const result = await tool._call({ network: 'mainnet', page: 2 });
      expect(result).toContain('Page 2 of');
      expect(result).toContain('Pool ID: 6');
    });

    it('should handle invalid page numbers', async () => {
      const result = await tool._call({ network: 'mainnet', page: 99 });
      expect(result).toContain('Invalid page number');
    });

    it('should show correct total pages', async () => {
      const result = await tool._call({ network: 'mainnet' });
      expect(result).toContain('of 2'); // 7 pools / 5 per page = 2 pages
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
      expect(result).toContain('Total pools available: 0');
    });
  });

  describe('data formatting', () => {
    it('should format numbers correctly', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: mockPoolData });
      const result = await tool._call({ network: 'mainnet' });
      expect(result).toContain('1,000,000'); // formatted amountA
    });

    it('should format prices correctly', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: mockPoolData });
      const result = await tool._call({ network: 'mainnet' });
      expect(result).toContain('$1.00'); // formatted price
      expect(result).toContain('$0.07'); // formatted price
    });

    it('should format fee rates correctly', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: mockPoolData });
      const result = await tool._call({ network: 'mainnet' });
      expect(result).toContain('0.05%'); // formatted fee rate
      expect(result).toContain('0.3%'); // formatted fee rate
    });
  });
}); 