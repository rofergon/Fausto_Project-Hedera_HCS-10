# SauceSwap Chart Plugin

This plugin generates candlestick charts for SauceSwap pools, allowing visualization of historical price, volume, and liquidity data.

## Features

- **Candlestick charts** with professional formatting
- **Automatic generation** of time ranges and intervals
- **Statistical calculation** (maximums, minimums, averages)
- **Volume visualization**
- **Flexible time format** ("1h", "4h", "1d", "1w", "3d 12h", etc.)
- **Local saving** of images as PNG

## Installation

1. Make sure you have all dependencies installed:
```bash
npm install canvas axios
```

2. Register the plugin in your application:
```typescript
import SauceSwapChartPlugin from './plugins/SauceSwap/CandlestickPlugin';

// In your initialization function
const chartPlugin = new SauceSwapChartPlugin();
await pluginRegistry.registerPlugin(chartPlugin);
```

## Usage

### From the command line

To test the chart generator you can use:

```bash
npm run sauceswap-chart-test
```

This will generate several example charts for pools 1 and 2 with different time intervals.

### In code

```typescript
import { CandlestickFetcher } from './utils/candlestickFetcher';
import { ChartRenderer } from './utils/chartRenderer';

// Create instances
const fetcher = new CandlestickFetcher('mainnet');
const renderer = new ChartRenderer();

// Get data
const chartData = await fetcher.getChartData(
  1,                 // Pool ID
  '1d',              // Time range
  false              // Inverted (optional)
);

// Save chart
const outputPath = './charts/my_chart.png';
await renderer.renderChart(chartData, outputPath);
```

### As an agent tool

The agent can use the `get_sauceswap_chart` tool to generate charts. Example queries:

- "Show me the chart for pool 1 for the last 4 hours"
- "Give me the chart for pool 2 from the last week"
- "I want to see the chart for pool 3 from the last 2 days"
- "Generate a 5-day chart for pool 4"

## File Structure

```
CandlestickPlugin/
  ├── index.ts                   # Plugin entry point
  ├── plugin.json                # Plugin configuration
  ├── __tests__/                 # Tests
  │   └── chartTest.ts           # Chart generator test
  └── utils/
      ├── candlestickFetcher.ts  # Data retrieval
      ├── chartRenderer.ts       # Visual generation
      └── timeCalculations.ts    # Time utilities
```

## Customization

### Size and style

You can adjust the chart dimensions and colors:

```typescript
const renderer = new ChartRenderer({
  width: 1600,       // Width in pixels
  height: 900,       // Height in pixels
  padding: 60,       // Inner spacing
  priceAxisWidth: 100, // Width of Y axis
  timeAxisHeight: 80   // Height of X axis
});
```

### Output directory

```typescript
// In the main plugin
this.outputDir = context.config.chartOutputDir || './charts';
```

## API Reference

### CandlestickFetcher

```typescript
getChartData(
  poolId: number,        // Pool ID
  timeRange: string,     // Time range (e.g.: "1d", "4h", "1w")
  inverted: boolean = false  // Invert price calculation
): Promise<CandlestickChartData>
```

### ChartRenderer

```typescript
renderChart(
  data: CandlestickChartData,  // Chart data
  outputPath: string           // Output path to save PNG
): Promise<string>
```

## License

This plugin is under the Apache-2.0 license. 