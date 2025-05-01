import { BasePlugin, PluginContext } from '../../../../src/plugins';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { CandlestickFetcher } from './utils/candlestickFetcher';
import { ChartRenderer } from './utils/chartRenderer';
import path from 'path';
import fs from 'fs';
import { inscribe, InscriptionOptions } from '@hashgraphonline/standards-sdk';
import sharp from 'sharp';

/**
 * Tool for getting candlestick chart data from SauceSwap
 */
export class GetSauceSwapChartTool extends StructuredTool {
  name = 'get_sauceswap_chart';
  description = 'Get historical price chart data for a SauceSwap pool with automatic interval selection';
  
  schema = z.object({
    poolId: z.number().describe('The ID of the pool to get chart data for'),
    timeRange: z.string().describe('Time range for the chart (e.g., "1h", "4h", "1d", "1w", "1d 6h", "2w 3d")'),
    inverted: z.boolean().optional().describe('Whether to invert the price calculation'),
    network: z.enum(['mainnet', 'testnet']).optional().describe('Network to use (mainnet or testnet)'),
    uploadToHedera: z.boolean().optional().describe('Whether to upload the chart to Hedera using inscribe (default: false)'),
    quality: z.number().optional().describe('Image quality for compression (1-100, default: 80)'),
    sendDirectlyInChat: z.boolean().optional().describe('If true, will send the image HRL directly in chat for rendering')
  });
  
  private fetcher: CandlestickFetcher;
  private renderer: ChartRenderer;
  private outputDir: string;
  private client: any;
  
  constructor(network: 'mainnet' | 'testnet' = 'mainnet', outputDir: string = './charts') {
    super();
    this.fetcher = new CandlestickFetcher(network);
    this.renderer = new ChartRenderer();
    this.outputDir = outputDir;
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      try {
        fs.mkdirSync(this.outputDir, { recursive: true });
        console.log(`Created charts directory: ${this.outputDir}`);
      } catch (error) {
        console.error(`Failed to create charts directory: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  setClient(client: any) {
    this.client = client;
  }
  
  /**
   * Compresses an image file using Sharp
   * @param inputPath Path to the original image
   * @param quality Compression quality (1-100)
   * @returns Buffer containing the compressed image
   */
  private async compressImage(inputPath: string, quality: number = 80): Promise<Buffer> {
    try {
      console.log(`Compressing image ${inputPath} with quality ${quality}...`);
      
      // Get original file size for comparison
      const originalStats = fs.statSync(inputPath);
      console.log(`Original file size: ${originalStats.size} bytes`);
      
      // Compress the image
      const compressedBuffer = await sharp(inputPath)
        .png({ quality })
        .toBuffer();
      
      console.log(`Compressed size: ${compressedBuffer.length} bytes (${Math.round(compressedBuffer.length / originalStats.size * 100)}% of original)`);
      return compressedBuffer;
    } catch (error) {
      console.error(`Error compressing image: ${error instanceof Error ? error.message : String(error)}`);
      // Return the original file as buffer if compression fails
      return fs.readFileSync(inputPath);
    }
  }
  
  /**
   * Format chart details to text
   */
  private formatChartDetails(poolId: number, chartData: any, outputPath: string, hrlLink: string = ""): string {
    return `Chart generated for Pool ${poolId}:

📊 Time Range: ${chartData.timeRange}
📈 Interval: ${chartData.interval}

Summary:
- Total Candles: ${chartData.summary.totalCandles}
- Time Period: ${chartData.summary.startTime} to ${chartData.summary.endTime}
- Highest Price: ${chartData.summary.highestPrice}
- Lowest Price: ${chartData.summary.lowestPrice}
- Total Volume: $${chartData.summary.totalVolume}
- Average Liquidity: $${chartData.summary.averageLiquidity}

Chart saved to: ${outputPath}${hrlLink ? `\nUploaded to Hedera: ${hrlLink}` : ''}

Latest Candlestick:
- Open: ${chartData.candlesticks[chartData.candlesticks.length - 1].open}
- High: ${chartData.candlesticks[chartData.candlesticks.length - 1].high}
- Low: ${chartData.candlesticks[chartData.candlesticks.length - 1].low}
- Close: ${chartData.candlesticks[chartData.candlesticks.length - 1].close}
- Volume: $${chartData.candlesticks[chartData.candlesticks.length - 1].volumeUsd}
- Liquidity: $${chartData.candlesticks[chartData.candlesticks.length - 1].liquidityUsd}`;
  }
  
  /**
   * Format a shorter memo for HRL messages
   */
  private formatHrlMemo(poolId: number, chartData: any, timeRange: string): string {
    return `Chart for Pool ${poolId} (${timeRange}) - Max: ${chartData.summary.highestPrice}, Min: ${chartData.summary.lowestPrice}, Vol: $${chartData.summary.totalVolume}`;
  }
  
  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    try {
      // Fetch chart data
      const chartData = await this.fetcher.getChartData(
        input.poolId,
        input.timeRange,
        input.inverted
      );
      
      // Generate filename
      const timestamp = Math.floor(Date.now() / 1000);
      const filename = `pool_${input.poolId}_${input.timeRange.replace(/\s+/g, '_')}_${timestamp}.png`;
      const outputPath = path.join(this.outputDir, filename);

      // Render and save chart
      await this.renderer.renderChart(chartData, outputPath);
      
      let hrlLink = "";
      
      // If uploadToHedera is true, upload the chart to Hedera using inscribe
      if (input.uploadToHedera) {
        try {
          if (!this.client) {
            throw new Error("HCS10Client not provided, cannot upload to Hedera");
          }
          
          // Compress the image before uploading
          const quality = input.quality || 80;
          const compressedBuffer = await this.compressImage(outputPath, quality);
          
          // Get credentials from the HCS10Client
          const { accountId, signer } = this.client.getAccountAndSigner();
          const network = this.client.getNetwork();
          
          // Get private key as string
          const privateKey = signer.toStringRaw();
          
          // Inscribe the compressed image
          const inscriptionResult = await inscribe(
            {
              type: 'buffer',
              buffer: compressedBuffer,
              fileName: filename,
              mimeType: 'image/png',
            },
            {
              accountId,
              privateKey,
              network,
            },
            {
              notes: `SauceSwap chart for pool ${input.poolId} - ${input.timeRange}`,
              waitForConfirmation: true,
            } as InscriptionOptions
          );
          
          if (inscriptionResult.confirmed && inscriptionResult.inscription) {
            // Format proper HRL with standard number (hcs://1/{topicId})
            hrlLink = `hcs://0.0.${inscriptionResult.inscription.topic_id.split('.').pop()}`;
            
            // If sendDirectlyInChat is true, just return the proper HRL format
            // This allows OpenConvAI to render it directly
            if (input.sendDirectlyInChat) {
              // For direct rendering in OpenConvAI, just return the HRL
              // The parent function/agent will handle sending it properly
              return hrlLink;
            }
          }
        } catch (error) {
          return `Chart generated for Pool ${input.poolId}, but failed to upload to Hedera: ${error instanceof Error ? error.message : String(error)}
          
Chart saved locally to: ${outputPath}

📊 Time Range: ${chartData.timeRange}
📈 Interval: ${chartData.interval}

Summary:
- Total Candles: ${chartData.summary.totalCandles}
- Time Period: ${chartData.summary.startTime} to ${chartData.summary.endTime}
- Highest Price: ${chartData.summary.highestPrice}
- Lowest Price: ${chartData.summary.lowestPrice}
- Total Volume: $${chartData.summary.totalVolume}
- Average Liquidity: $${chartData.summary.averageLiquidity}

Latest Candlestick:
- Open: ${chartData.candlesticks[chartData.candlesticks.length - 1].open}
- High: ${chartData.candlesticks[chartData.candlesticks.length - 1].high}
- Low: ${chartData.candlesticks[chartData.candlesticks.length - 1].low}
- Close: ${chartData.candlesticks[chartData.candlesticks.length - 1].close}
- Volume: $${chartData.candlesticks[chartData.candlesticks.length - 1].volumeUsd}
- Liquidity: $${chartData.candlesticks[chartData.candlesticks.length - 1].liquidityUsd}`;
        }
      }

      // Return formatted response with chart info and file location
      return this.formatChartDetails(input.poolId, chartData, outputPath, hrlLink);
    } catch (error) {
      return `Error generating chart: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/**
 * SauceSwap Chart Plugin
 */
export default class SauceSwapChartPlugin extends BasePlugin {
  id = 'sauceswap-chart';
  name = 'SauceSwap Chart Plugin';
  description = 'Provides tools to access and visualize SauceSwap price charts';
  version = '1.0.0';
  author = 'Your Name';
  
  private network: 'mainnet' | 'testnet' = 'mainnet';
  private outputDir: string = './charts';
  private chartTool: GetSauceSwapChartTool = new GetSauceSwapChartTool();
  
  async initialize(context: PluginContext): Promise<void> {
    await super.initialize(context);
    this.network = context.config?.network || 'mainnet';
    this.outputDir = context.config?.chartOutputDir || './charts';
    
    // Create the chart tool
    this.chartTool = new GetSauceSwapChartTool(this.network, this.outputDir);
    
    // Pass the HCS10Client to the tool so it can access credentials
    if (context.client) {
      this.chartTool.setClient(context.client);
    }
  }
  
  getTools(): StructuredTool[] {
    return [this.chartTool];
  }
} 