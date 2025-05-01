import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import { Candlestick, CandlestickChartData } from './candlestickFetcher';
import { formatTimestamp } from './timeCalculations';
import path from 'path';
import fs from 'fs';

interface ChartDimensions {
  width: number;
  height: number;
  padding: number;
  priceAxisWidth: number;
  timeAxisHeight: number;
}

interface ChartScales {
  xScale: (index: number) => number;
  yScale: (price: number) => number;
  minPrice: number;
  maxPrice: number;
  priceRange: number;
}

export class ChartRenderer {
  private dimensions: ChartDimensions = {
    width: 1200,
    height: 800,
    padding: 50,
    priceAxisWidth: 80,
    timeAxisHeight: 60
  };

  private colors = {
    background: '#1a1a1a',
    text: '#ffffff',
    grid: '#2a2a2a',
    upCandle: '#26a69a',
    downCandle: '#ef5350',
    volume: '#2196f3'
  };

  constructor(dimensions?: Partial<ChartDimensions>) {
    this.dimensions = { ...this.dimensions, ...dimensions };
  }

  private calculateScales(candlesticks: Candlestick[]): ChartScales {
    const prices = candlesticks.flatMap(c => [c.high, c.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.05; // 5% padding

    const chartWidth = this.dimensions.width - this.dimensions.padding * 2 - this.dimensions.priceAxisWidth;
    const chartHeight = this.dimensions.height - this.dimensions.padding * 2 - this.dimensions.timeAxisHeight;

    return {
      xScale: (index: number) => this.dimensions.padding + this.dimensions.priceAxisWidth + 
        (index * chartWidth) / (candlesticks.length - 1),
      yScale: (price: number) => this.dimensions.padding + 
        chartHeight - ((price - (minPrice - pricePadding)) * chartHeight) / (priceRange + 2 * pricePadding),
      minPrice: minPrice - pricePadding,
      maxPrice: maxPrice + pricePadding,
      priceRange: priceRange + 2 * pricePadding
    };
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, this.dimensions.width, this.dimensions.height);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, scales: ChartScales): void {
    const { width, height, padding, priceAxisWidth, timeAxisHeight } = this.dimensions;
    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 0.5;

    // Vertical grid lines
    for (let x = padding + priceAxisWidth; x < width - padding; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding - timeAxisHeight);
      ctx.stroke();
    }

    // Horizontal grid lines
    const priceStep = scales.priceRange / 10;
    for (let price = scales.minPrice; price <= scales.maxPrice; price += priceStep) {
      const y = scales.yScale(price);
      ctx.beginPath();
      ctx.moveTo(padding + priceAxisWidth, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }
  }

  private drawPriceAxis(ctx: CanvasRenderingContext2D, scales: ChartScales): void {
    const { height, padding, timeAxisHeight } = this.dimensions;
    ctx.fillStyle = this.colors.text;
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';

    const priceStep = scales.priceRange / 10;
    for (let price = scales.minPrice; price <= scales.maxPrice; price += priceStep) {
      const y = scales.yScale(price);
      if (y > padding && y < height - padding - timeAxisHeight) {
        ctx.fillText(price.toFixed(6), padding + this.dimensions.priceAxisWidth - 10, y + 4);
      }
    }
  }

  private drawTimeAxis(ctx: CanvasRenderingContext2D, candlesticks: Candlestick[], scales: ChartScales): void {
    const { height, padding, priceAxisWidth } = this.dimensions;
    ctx.fillStyle = this.colors.text;
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';

    // Draw time labels for every nth candlestick
    const step = Math.max(1, Math.floor(candlesticks.length / 8));
    for (let i = 0; i < candlesticks.length; i += step) {
      const x = scales.xScale(i);
      const timestamp = formatTimestamp(candlesticks[i].timestamp);
      ctx.fillText(timestamp, x, height - padding + 20);
    }
  }

  private drawCandlesticks(ctx: CanvasRenderingContext2D, candlesticks: Candlestick[], scales: ChartScales): void {
    const candleWidth = Math.min(
      8,
      (this.dimensions.width - this.dimensions.padding * 2 - this.dimensions.priceAxisWidth) / candlesticks.length - 2
    );

    candlesticks.forEach((candle, i) => {
      const x = scales.xScale(i);
      const open = scales.yScale(candle.open);
      const close = scales.yScale(candle.close);
      const high = scales.yScale(candle.high);
      const low = scales.yScale(candle.low);

      // Draw the wick
      ctx.beginPath();
      ctx.strokeStyle = candle.close >= candle.open ? this.colors.upCandle : this.colors.downCandle;
      ctx.moveTo(x, high);
      ctx.lineTo(x, low);
      ctx.stroke();

      // Draw the body
      ctx.fillStyle = candle.close >= candle.open ? this.colors.upCandle : this.colors.downCandle;
      const bodyHeight = Math.max(1, Math.abs(close - open));
      ctx.fillRect(x - candleWidth / 2, Math.min(open, close), candleWidth, bodyHeight);
    });
  }

  private drawVolume(ctx: CanvasRenderingContext2D, candlesticks: Candlestick[], scales: ChartScales): void {
    const volumes = candlesticks.map(c => parseFloat(c.volumeUsd));
    const maxVolume = Math.max(...volumes);
    const volumeHeight = this.dimensions.height * 0.2;
    const candleWidth = Math.min(
      8,
      (this.dimensions.width - this.dimensions.padding * 2 - this.dimensions.priceAxisWidth) / candlesticks.length - 2
    );

    ctx.fillStyle = this.colors.volume;
    ctx.globalAlpha = 0.5;

    candlesticks.forEach((candle, i) => {
      const x = scales.xScale(i);
      const volume = parseFloat(candle.volumeUsd);
      const height = (volume / maxVolume) * volumeHeight;
      const y = this.dimensions.height - this.dimensions.padding - this.dimensions.timeAxisHeight - height;
      ctx.fillRect(x - candleWidth / 2, y, candleWidth, height);
    });

    ctx.globalAlpha = 1;
  }

  private drawTitle(ctx: CanvasRenderingContext2D, data: CandlestickChartData): void {
    ctx.fillStyle = this.colors.text;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(
      `Pool ${data.poolId} - ${data.timeRange} (${data.interval})`,
      this.dimensions.padding + this.dimensions.priceAxisWidth,
      this.dimensions.padding - 20
    );
  }

  public async renderChart(data: CandlestickChartData, outputPath: string): Promise<string> {
    const canvas = createCanvas(this.dimensions.width, this.dimensions.height);
    const ctx = canvas.getContext('2d');
    const scales = this.calculateScales(data.candlesticks);

    // Draw chart components
    this.drawBackground(ctx);
    this.drawGrid(ctx, scales);
    this.drawPriceAxis(ctx, scales);
    this.drawTimeAxis(ctx, data.candlesticks, scales);
    this.drawVolume(ctx, data.candlesticks, scales);
    this.drawCandlesticks(ctx, data.candlesticks, scales);
    this.drawTitle(ctx, data);

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save the chart
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
  }
} 