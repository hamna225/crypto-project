"""
Technical Indicator Feature Engineering
========================================
Computes all price-derived features used by LSTM and XGBoost models.
All functions are pure (no side effects) and fully unit-testable.
"""

from __future__ import annotations
import numpy as np
import pandas as pd
from dataclasses import dataclass


@dataclass(frozen=True)
class IndicatorConfig:
    rsi_period: int = 14
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    bb_period: int = 20
    bb_std: float = 2.0
    ema_periods: tuple = (9, 21, 50)
    atr_period: int = 14
    volume_ma_period: int = 20
    volatility_window_7d: int = 7 * 24
    volatility_window_30d: int = 30 * 24


DEFAULT_CONFIG = IndicatorConfig()


def compute_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """RSI using Wilder's smoothing. Returns [0, 100], NaN for warm-up rows."""
    if len(close) < period + 1:
        return pd.Series(np.nan, index=close.index)

    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

    # Handle zero loss case (RSI = 100)
    rsi = pd.Series(100.0, index=close.index)
    
    # Only compute RS where loss is non-zero
    mask = (avg_loss > 0) & (avg_gain.notna()) & (avg_loss.notna())
    rs = avg_gain[mask] / avg_loss[mask]
    rsi[mask] = 100 - (100 / (1 + rs))
    
    # Restore NaNs for warm-up period
    rsi[avg_gain.isna() | avg_loss.isna()] = np.nan
    
    return rsi.rename('rsi')


def compute_macd(close: pd.Series, fast=12, slow=26, signal=9) -> pd.DataFrame:
    """Returns macd_line, macd_signal, macd_histogram columns."""
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return pd.DataFrame({
        'macd_line': macd_line,
        'macd_signal': signal_line,
        'macd_histogram': macd_line - signal_line,
    }, index=close.index)


def compute_bollinger_bands(close: pd.Series, period=20, num_std=2.0) -> pd.DataFrame:
    """Bollinger Bands with %B indicator."""
    sma = close.rolling(window=period).mean()
    std = close.rolling(window=period).std(ddof=0)
    upper = sma + (num_std * std)
    lower = sma - (num_std * std)
    band_range = (upper - lower).replace(0, np.nan)

    return pd.DataFrame({
        'bb_upper': upper,
        'bb_middle': sma,
        'bb_lower': lower,
        'bb_width': band_range / sma.replace(0, np.nan),
        'bb_pct_b': (close - lower) / band_range,
    }, index=close.index)


def compute_ema(close: pd.Series, periods: tuple) -> pd.DataFrame:
    return pd.DataFrame(
        {f'ema_{p}': close.ewm(span=p, adjust=False).mean() for p in periods},
        index=close.index,
    )


def compute_atr(high: pd.Series, low: pd.Series, close: pd.Series, period=14) -> pd.Series:
    """Average True Range — volatility measure."""
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean().rename('atr')


def compute_volume_features(volume: pd.Series, close: pd.Series, period=20) -> pd.DataFrame:
    """Volume MA, ratio, and On-Balance Volume."""
    vol_ma = volume.rolling(window=period).mean()
    direction = close.diff().apply(lambda x: 1 if x > 0 else (-1 if x < 0 else 0))
    return pd.DataFrame({
        'volume_ma': vol_ma,
        'volume_ratio': volume / vol_ma.replace(0, np.nan),
        'obv': (volume * direction).cumsum(),
    }, index=volume.index)


def build_feature_matrix(df: pd.DataFrame, config: IndicatorConfig = DEFAULT_CONFIG) -> pd.DataFrame:
    """
    Master function: OHLCV DataFrame → full ML feature matrix.
    Requires columns: open, high, low, close, volume
    Returns float64 DataFrame. NaN warm-up rows are NOT dropped here.
    """
    required = {'open', 'high', 'low', 'close', 'volume'}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing OHLCV columns: {missing}")

    close, high, low, vol = df['close'], df['high'], df['low'], df['volume']
    features = pd.DataFrame(index=df.index)

    # Price returns
    for n in [1, 5, 15, 60]:
        features[f'return_{n}'] = close.pct_change(n)

    # Volatility
    features['volatility_7d'] = close.pct_change().rolling(config.volatility_window_7d).std()
    features['volatility_30d'] = close.pct_change().rolling(config.volatility_window_30d).std()
    features['high_low_ratio'] = (high - low) / close.replace(0, np.nan)

    # Indicators
    features['rsi'] = compute_rsi(close, config.rsi_period)
    features = pd.concat([features, compute_macd(close, config.macd_fast, config.macd_slow, config.macd_signal)], axis=1)
    features = pd.concat([features, compute_bollinger_bands(close, config.bb_period, config.bb_std)], axis=1)
    features = pd.concat([features, compute_ema(close, config.ema_periods)], axis=1)

    # EMA cross-overs (binary)
    # Use the first two EMA periods if at least two are specified
    if len(config.ema_periods) >= 2:
        p1, p2 = config.ema_periods[0], config.ema_periods[1]
        features[f'ema_{p1}_{p2}_cross'] = (features[f'ema_{p1}'] > features[f'ema_{p2}']).astype(float)
    if len(config.ema_periods) >= 3:
        p2, p3 = config.ema_periods[1], config.ema_periods[2]
        features[f'ema_{p2}_{p3}_cross'] = (features[f'ema_{p2}'] > features[f'ema_{p3}']).astype(float)

    features['atr'] = compute_atr(high, low, close, config.atr_period)
    features['atr_pct'] = features['atr'] / close.replace(0, np.nan)
    features = pd.concat([features, compute_volume_features(vol, close, config.volume_ma_period)], axis=1)

    return features.astype('float64')


def label_direction(close: pd.Series, horizon: int, threshold_pct: float = 0.5) -> pd.Series:
    """
    3-class label: 0=DOWN, 1=SIDEWAYS, 2=UP
    Future return > +threshold% = UP, < -threshold% = DOWN, else SIDEWAYS.
    Last `horizon` rows = NaN.
    """
    future_return = close.shift(-horizon) / close - 1
    labels = pd.Series(1.0, index=close.index)
    labels[future_return > threshold_pct / 100] = 2.0
    labels[future_return < -threshold_pct / 100] = 0.0
    labels[future_return.isna()] = np.nan
    return labels.rename('direction_label')
