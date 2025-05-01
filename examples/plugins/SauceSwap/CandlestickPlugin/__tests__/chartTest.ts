import { CandlestickFetcher } from '../utils/candlestickFetcher';
import { ChartRenderer } from '../utils/chartRenderer';
import path from 'path';
import fs from 'fs';

/**
 * Simple test to generate charts for pool IDs 1 and 2 with different time ranges
 */
async function testChartGenerator() {
  console.log('Starting SauceSwap Chart Generator Test');
  
  // Create output directory if it doesn't exist
  const outputDir = path.join(process.cwd(), 'charts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }
  
  const fetcher = new CandlestickFetcher('mainnet');
  const renderer = new ChartRenderer();
  
  // Array of test scenarios
  const testCases = [
    { poolId: 3, timeRange: '4h', description: '4 hour chart for Pool 1' },
    { poolId: 3, timeRange: '1d', description: '1 day chart for Pool 1' },
    { poolId: 3, timeRange: '1w', description: '1 week chart for Pool 1' },
    { poolId: 4, timeRange: '4h', description: '4 hour chart for Pool 2' },
    { poolId: 4, timeRange: '1d', description: '1 day chart for Pool 2' },
    { poolId: 4, timeRange: '1w', description: '1 week chart for Pool 2' }
  ];
  
  // Process each test case
  for (const test of testCases) {
    console.log(`\nGenerating ${test.description}...`);
    
    try {
      // Get chart data
      const startTime = Date.now();
      const chartData = await fetcher.getChartData(test.poolId, test.timeRange);
      const fetchTime = Date.now() - startTime;
      
      console.log(`Data fetched in ${fetchTime}ms. Found ${chartData.candlesticks.length} candlesticks.`);
      console.log(`Interval: ${chartData.interval}, Time range: ${chartData.timeRange}`);
      
      // Generate filename
      const timestamp = Math.floor(Date.now() / 1000);
      const filename = `pool_${test.poolId}_${test.timeRange}_${timestamp}.png`;
      const outputPath = path.join(outputDir, filename);
      
      // Render chart
      const renderStartTime = Date.now();
      await renderer.renderChart(chartData, outputPath);
      const renderTime = Date.now() - renderStartTime;
      
      console.log(`Chart rendered in ${renderTime}ms`);
      console.log(`Chart saved to: ${outputPath}`);
      
      // Print chart summary
      console.log('\nChart Summary:');
      console.log(`- Total Candles: ${chartData.summary.totalCandles}`);
      console.log(`- Time Period: ${chartData.summary.startTime} to ${chartData.summary.endTime}`);
      console.log(`- Highest Price: ${chartData.summary.highestPrice}`);
      console.log(`- Lowest Price: ${chartData.summary.lowestPrice}`);
      console.log(`- Total Volume: ${chartData.summary.totalVolume}`);
      console.log(`- Average Liquidity: ${chartData.summary.averageLiquidity}`);
      
    } catch (error) {
      console.error(`Error generating ${test.description}:`, error instanceof Error ? error.message : String(error));
    }
  }
  
  console.log('\nTest complete. Check the charts directory for output files.');
}

// Run the test
testChartGenerator().catch(error => {
  console.error('Test failed with error:', error);
}); 