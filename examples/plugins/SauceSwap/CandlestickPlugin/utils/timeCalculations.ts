/**
 * Utility functions for candlestick time calculations
 */

export interface TimeRange {
  from: number;
  to: number;
  totalSeconds: number;
}

export interface CandlestickConfig {
  interval: 'FIVE' | 'MIN' | 'HOUR' | 'DAY' | 'WEEK';
  maxCandles: number;
  intervalSeconds: number;
}

const INTERVAL_SECONDS = {
  FIVE: 5 * 60,        // 5 minutes
  MIN: 60,             // 1 minute
  HOUR: 3600,          // 1 hour
  DAY: 86400,          // 1 day
  WEEK: 604800         // 1 week
};

const MAX_CANDLES_PER_INTERVAL = {
  FIVE: 288,           // 24 hours worth of 5-min candles
  MIN: 1440,           // 24 hours worth of 1-min candles
  HOUR: 168,           // 1 week worth of hourly candles
  DAY: 90,            // 3 months worth of daily candles
  WEEK: 52            // 1 year worth of weekly candles
};

/**
 * Parse time string into seconds
 * Supports formats like "1d", "2h", "30m", "1w", "1d 6h", "2w 3d 12h"
 */
export function parseTimeString(timeStr: string): number {
  const parts = timeStr.toLowerCase().trim().split(' ');
  let totalSeconds = 0;

  for (const part of parts) {
    const value = parseInt(part);
    const unit = part.replace(/[0-9]/g, '');

    switch (unit) {
      case 'w':
        totalSeconds += value * 604800;
        break;
      case 'd':
        totalSeconds += value * 86400;
        break;
      case 'h':
        totalSeconds += value * 3600;
        break;
      case 'm':
        totalSeconds += value * 60;
        break;
      default:
        throw new Error(`Invalid time unit: ${unit}`);
    }
  }

  return totalSeconds;
}

/**
 * Calculate optimal interval and number of candles based on time range
 */
export function calculateOptimalInterval(timeRangeStr: string): CandlestickConfig {
  const totalSeconds = parseTimeString(timeRangeStr);
  
  // Select appropriate interval based on total time range
  let interval: 'FIVE' | 'MIN' | 'HOUR' | 'DAY' | 'WEEK';
  if (totalSeconds <= 3600) {        // ≤ 1 hour: use 1-min candles
    interval = 'MIN';
  } else if (totalSeconds <= 86400) { // ≤ 1 day: use 5-min candles
    interval = 'FIVE';
  } else if (totalSeconds <= 604800) { // ≤ 1 week: use hourly candles
    interval = 'HOUR';
  } else if (totalSeconds <= 7776000) { // ≤ 90 days: use daily candles
    interval = 'DAY';
  } else {                              // > 90 days: use weekly candles
    interval = 'WEEK';
  }

  const intervalSeconds = INTERVAL_SECONDS[interval];
  const maxCandles = Math.min(
    Math.ceil(totalSeconds / intervalSeconds),
    MAX_CANDLES_PER_INTERVAL[interval]
  );

  return {
    interval,
    maxCandles,
    intervalSeconds
  };
}

/**
 * Calculate time ranges for fetching candlestick data
 */
export function calculateTimeRanges(timeRangeStr: string): TimeRange {
  const now = Math.floor(Date.now() / 1000);
  const totalSeconds = parseTimeString(timeRangeStr);
  
  return {
    from: now - totalSeconds,
    to: now,
    totalSeconds
  };
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
} 