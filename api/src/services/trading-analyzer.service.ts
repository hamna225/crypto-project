export interface Candle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AnalysisResult {
  marketBias: 'Bullish' | 'Bearish' | 'Neutral' | 'Sideways';
  keyLevels: {
    poc: number;
    support: number[];
    resistance: number[];
  };
  vwap: {
    anchorUsed: 'Swing Low' | 'Swing High' | 'None';
    anchorDate: string | null;
    vwapLevel: number;
    priceVsVwap: 'Above' | 'Below' | 'Touching';
  };
  orderFlow: {
    control: 'Buyers' | 'Sellers' | 'Contested';
    signalType: 'Continuation' | 'Reversal' | 'Absorption' | 'None';
  };
  tradeIdea: {
    action: 'LONG' | 'SHORT' | 'WAIT';
    entry: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    confidence: 'High' | 'Medium' | 'Low';
    reasoning: string[];
  };
}

export class TradingAnalyzerService {
  /**
   * Analyzes a dataset of candles according to the deterministic strategy.
   * Dataset must be in chronological order (oldest first).
   */
  public analyze(candles: Candle[]): AnalysisResult {
    if (candles.length < 2) throw new Error('Insufficient candles (at least 2 required)');

    // 1. Volume Profile
    const profile = this.computeVolumeProfile(candles, 50);
    const poc = profile.poc;
    const supportResistance = this.findSupportResistance(profile.bins, poc, candles[candles.length - 1].close);

    // 2. Anchored VWAP
    const [anchorType, anchorIndex] = this.findLatestSwingAnchor(candles, 20);
    const vwapData = this.computeAnchoredVWAP(candles, anchorIndex);
    const lastPrice = candles[candles.length - 1].close;

    let priceVsVwap: 'Above' | 'Below' | 'Touching' = 'Touching';
    const tolerance = lastPrice * 0.001; // 0.1% tolerance for "Touching"
    if (lastPrice > vwapData.vwapValue + tolerance) priceVsVwap = 'Above';
    else if (lastPrice < vwapData.vwapValue - tolerance) priceVsVwap = 'Below';

    let vwapBias = 'Neutral';
    if (priceVsVwap === 'Above') vwapBias = 'Bullish';
    else if (priceVsVwap === 'Below') vwapBias = 'Bearish';

    // 3. Order Flow Estimation
    const orderFlow = this.estimateOrderFlow(candles);

    // 4. Synthesize Trade Idea
    const action = this.makeTradeDecision(vwapBias, orderFlow, lastPrice, supportResistance);

    const isSideways = Math.abs(poc - lastPrice) / lastPrice < 0.002 && orderFlow.signalType === 'None';
    
    let overallBias: 'Bullish' | 'Bearish' | 'Neutral' | 'Sideways' = 'Neutral';
    if (isSideways) overallBias = 'Sideways';
    else if (vwapBias === 'Bullish' && action.action === 'LONG') overallBias = 'Bullish';
    else if (vwapBias === 'Bearish' && action.action === 'SHORT') overallBias = 'Bearish';

    return {
      marketBias: overallBias,
      keyLevels: { ...supportResistance, poc },
      vwap: {
        anchorUsed: anchorType,
        anchorDate: anchorIndex !== -1 ? (candles[anchorIndex]?.ts ?? null) : null,
        vwapLevel: vwapData.vwapValue,
        priceVsVwap,
      },
      orderFlow,
      tradeIdea: action
    };
  }

  // ─── Algorithm Internals ──────────────────────────────────────────────────

  private computeVolumeProfile(candles: Candle[], binCount: number) {
    let minLow = Infinity;
    let maxHigh = -Infinity;
    
    for (const c of candles) {
      if (c.low < minLow) minLow = c.low;
      if (c.high > maxHigh) maxHigh = c.high;
    }

    if (minLow === maxHigh) minLow -= 1; // Prevent range zero

    const range = maxHigh - minLow;
    const binSize = range / binCount;
    const bins = new Array<{ priceMid: number; volume: number }>(binCount);

    for (let i = 0; i < binCount; i++) {
        bins[i] = { priceMid: minLow + (i + 0.5) * binSize, volume: 0 };
    }

    for (const c of candles) {
      const top = Math.max(c.open, c.close, c.high);
      const bottom = Math.min(c.open, c.close, c.low);
      
      const startBin = Math.max(0, Math.floor((bottom - minLow) / binSize));
      const endBin = Math.min(binCount - 1, Math.floor((top - minLow) / binSize));
      
      const span = (endBin - startBin + 1);
      const volPerBin = c.volume / span;
      
      for (let i = startBin; i <= endBin; i++) {
        bins[i].volume += volPerBin;
      }
    }

    let maxVol = -1;
    let poc = bins[0].priceMid;

    for (const b of bins) {
      if (b.volume > maxVol) {
        maxVol = b.volume;
        poc = b.priceMid;
      }
    }

    return { bins, poc };
  }

  private findSupportResistance(bins: { priceMid: number; volume: number }[], poc: number, currentPrice: number) {
    // Sort bins by volume descending to find highest volume nodes
    const sorted = [...bins].sort((a, b) => b.volume - a.volume);
    const nodes = sorted.slice(0, 10).map(b => b.priceMid);

    const support = nodes.filter(p => p < currentPrice).sort((a, b) => b - a).slice(0, 3);
    const resistance = nodes.filter(p => p > currentPrice).sort((a, b) => a - b).slice(0, 3);

    return { support, resistance };
  }

  private findLatestSwingAnchor(candles: Candle[], lookback: number): ['Swing Low' | 'Swing High' | 'None', number] {
    if (candles.length < lookback) lookback = candles.length;
    let minIdx = -1;
    let maxIdx = -1;
    let minVal = Infinity;
    let maxVal = -Infinity;

    const startIdx = candles.length - lookback;

    for (let i = startIdx; i < candles.length - 1; i++) { // Ignore very last current candle for finding structural swing
      if (candles[i].low < minVal) {
        minVal = candles[i].low;
        minIdx = i;
      }
      if (candles[i].high > maxVal) {
        maxVal = candles[i].high;
        maxIdx = i;
      }
    }

    if (minIdx === -1 && maxIdx === -1) return ['None', 0];

    // Whichever is more recent is the anchor for current structure
    if (minIdx >= maxIdx) return ['Swing Low', minIdx];
    return ['Swing High', maxIdx];
  }

  private computeAnchoredVWAP(candles: Candle[], anchorIdx: number): { vwapValue: number } {
    if (anchorIdx < 0) anchorIdx = 0;
    let cumVolume = 0;
    let cumTypicalPxVol = 0;

    for (let i = anchorIdx; i < candles.length; i++) {
      const c = candles[i];
      const typ = (c.high + c.low + c.close) / 3;
      cumVolume += c.volume;
      cumTypicalPxVol += typ * c.volume;
    }

    if (cumVolume === 0) return { vwapValue: candles[candles.length - 1].close };
    return { vwapValue: cumTypicalPxVol / cumVolume };
  }

  private estimateOrderFlow(candles: Candle[]) {
    // Check average volume over last 20
    const lookback = Math.min(20, candles.length);
    const avgVol = candles.slice(-lookback).reduce((sum, c) => sum + c.volume, 0) / lookback;

    // Check last 2 candles
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2] || current;

    const isHighVolume = current.volume > avgVol * 1.5;
    
    // Body and wick measurement
    const body = Math.abs(current.close - current.open);
    const range = current.high - current.low;
    const bodyPct = range === 0 ? 0 : body / range;

    const upperWick = current.high - Math.max(current.close, current.open);
    const lowerWick = Math.min(current.close, current.open) - current.low;

    let control: 'Buyers' | 'Sellers' | 'Contested' = 'Contested';
    let signalType: 'Continuation' | 'Reversal' | 'Absorption' | 'None' = 'None';

    const isBullish = current.close > current.open;
    const isBearish = current.open > current.close;

    if (isBullish && isHighVolume && bodyPct > 0.6) {
      control = 'Buyers';
      signalType = 'Continuation';
    } else if (isBearish && isHighVolume && bodyPct > 0.6) {
      control = 'Sellers';
      signalType = 'Continuation';
    }

    if (isHighVolume && bodyPct < 0.25) {
      signalType = 'Absorption';
      if (lowerWick > upperWick) control = 'Buyers'; // Absorbing sell pressure
      else control = 'Sellers'; // Absorbing buy pressure
    }

    // Huge rejection wick
    if (upperWick > range * 0.5 && isHighVolume) {
      control = 'Sellers';
      signalType = 'Reversal';
    } else if (lowerWick > range * 0.5 && isHighVolume) {
      control = 'Buyers';
      signalType = 'Reversal';
    }

    return { control, signalType };
  }

  private makeTradeDecision(
    vwapBias: string,
    orderFlow: { control: string; signalType: string },
    lastPrice: number,
    levels: { support: number[]; resistance: number[] }
  ): AnalysisResult['tradeIdea'] {
    let action: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
    const reasoning: string[] = [];
    let confidence: 'High' | 'Medium' | 'Low' = 'Low';
    
    if (vwapBias === 'Bullish' && orderFlow.control === 'Buyers') {
      action = 'LONG';
      reasoning.push('Price is structurally holding above Anchor VWAP.');
      reasoning.push('Order flow aligns with buyers.');
      if (orderFlow.signalType === 'Continuation') confidence = 'High';
      else confidence = 'Medium';
    } else if (vwapBias === 'Bearish' && orderFlow.control === 'Sellers') {
      action = 'SHORT';
      reasoning.push('Price structure is bleeding below Anchor VWAP.');
      reasoning.push('Order flow is dominated by active sellers.');
      if (orderFlow.signalType === 'Continuation') confidence = 'High';
      else confidence = 'Medium';
    } else {
      reasoning.push('Conflicting signals or sideways chop. Await structurally aligned momentum.');
    }

    let entry = null;
    let stopLoss = null;
    let takeProfit = null;

    if (action === 'LONG') {
      entry = lastPrice;
      stopLoss = levels.support[0] ? levels.support[0] * 0.995 : lastPrice * 0.98;
      takeProfit = levels.resistance[0] ? levels.resistance[0] : lastPrice * 1.05;
    } else if (action === 'SHORT') {
      entry = lastPrice;
      stopLoss = levels.resistance[0] ? levels.resistance[0] * 1.005 : lastPrice * 1.02;
      takeProfit = levels.support[0] ? levels.support[0] : lastPrice * 0.95;
    }

    return { action, entry, stopLoss, takeProfit, confidence, reasoning };
  }
}

export const tradingAnalyzerService = new TradingAnalyzerService();
