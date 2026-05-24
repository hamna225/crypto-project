"""
Unit Tests — Technical Indicators Feature Engineering
======================================================
All tests use synthetic price data to ensure deterministic results.
"""

import pytest
import numpy as np
import pandas as pd

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.features.technical_indicators import (
    compute_rsi,
    compute_macd,
    compute_bollinger_bands,
    compute_ema,
    compute_atr,
    compute_volume_features,
    build_feature_matrix,
    label_direction,
    IndicatorConfig,
    DEFAULT_CONFIG,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────

def make_close(n: int = 200, start: float = 100.0, trend: float = 0.001) -> pd.Series:
    """Generate synthetic close prices with mild uptrend + noise."""
    rng = np.random.default_rng(seed=42)
    returns = trend + rng.normal(0, 0.01, n)
    prices = start * np.exp(np.cumsum(returns))
    return pd.Series(prices, name='close')


def make_ohlcv(n: int = 200) -> pd.DataFrame:
    """Generate synthetic OHLCV DataFrame."""
    close = make_close(n)
    rng = np.random.default_rng(seed=42)
    spread = close * 0.005
    return pd.DataFrame({
        'open':   close + rng.normal(0, 0.001, n) * close,
        'high':   close + spread.abs(),
        'low':    close - spread.abs(),
        'close':  close,
        'volume': rng.uniform(1000, 50000, n),
    })


# ─── RSI Tests ────────────────────────────────────────────────────────────────

class TestComputeRSI:
    def test_returns_series_same_length(self):
        close = make_close()
        rsi = compute_rsi(close, period=14)
        assert len(rsi) == len(close)

    def test_values_in_range_0_100(self):
        close = make_close()
        rsi = compute_rsi(close, period=14)
        valid = rsi.dropna()
        assert (valid >= 0).all() and (valid <= 100).all()

    def test_has_nan_during_warmup(self):
        close = make_close()
        rsi = compute_rsi(close, period=14)
        # First 14 rows should be NaN
        assert rsi.iloc[:14].isna().all()

    def test_too_short_series_returns_all_nan(self):
        close = make_close(n=5)
        rsi = compute_rsi(close, period=14)
        assert rsi.isna().all()

    def test_constant_prices_handle_zero_loss(self):
        close = pd.Series([100.0] * 50)
        # Should not raise ZeroDivisionError
        rsi = compute_rsi(close, period=14)
        assert rsi is not None

    def test_rsi_overbought_on_strong_uptrend(self):
        """Sustained uptrend should push RSI toward 70+."""
        prices = pd.Series([100 + i * 2.0 for i in range(50)])
        rsi = compute_rsi(prices, period=14)
        # Last value should be overbought
        assert rsi.dropna().iloc[-1] > 60


# ─── MACD Tests ───────────────────────────────────────────────────────────────

class TestComputeMACD:
    def test_returns_three_columns(self):
        close = make_close()
        macd_df = compute_macd(close)
        assert set(macd_df.columns) == {'macd_line', 'macd_signal', 'macd_histogram'}

    def test_histogram_equals_line_minus_signal(self):
        close = make_close()
        df = compute_macd(close)
        expected = df['macd_line'] - df['macd_signal']
        pd.testing.assert_series_equal(df['macd_histogram'], expected, check_names=False)

    def test_same_index_as_input(self):
        close = make_close()
        macd_df = compute_macd(close)
        assert macd_df.index.equals(close.index)

    def test_fast_ema_greater_than_slow_on_uptrend(self):
        """Fast EMA should track price more closely on uptrend."""
        prices = pd.Series([100 + i for i in range(100)])
        df = compute_macd(prices, fast=5, slow=20)
        assert df['macd_line'].dropna().iloc[-1] > 0


# ─── Bollinger Bands Tests ────────────────────────────────────────────────────

class TestBollingerBands:
    def test_returns_five_columns(self):
        close = make_close()
        bb = compute_bollinger_bands(close)
        assert set(bb.columns) == {'bb_upper', 'bb_middle', 'bb_lower', 'bb_width', 'bb_pct_b'}

    def test_upper_always_gte_lower(self):
        close = make_close()
        bb = compute_bollinger_bands(close).dropna()
        assert (bb['bb_upper'] >= bb['bb_lower']).all()

    def test_middle_is_simple_moving_average(self):
        close = make_close(100)
        bb = compute_bollinger_bands(close, period=20)
        sma = close.rolling(20).mean()
        pd.testing.assert_series_equal(bb['bb_middle'], sma, check_names=False)

    def test_pct_b_near_0_5_at_middle_band(self):
        """When price equals SMA, %B should equal 0.5."""
        close = make_close()
        bb = compute_bollinger_bands(close, period=20)
        sma = close.rolling(20).mean()
        # Find rows where price ≈ SMA
        near_middle = (close - sma).abs() < close * 0.001
        if near_middle.any():
            assert abs(bb['bb_pct_b'][near_middle].mean() - 0.5) < 0.15

    def test_constant_prices_handle_zero_std(self):
        close = pd.Series([100.0] * 50)
        bb = compute_bollinger_bands(close, period=20)
        # Should not raise — NaN is acceptable for zero-std rows
        assert bb is not None


# ─── ATR Tests ────────────────────────────────────────────────────────────────

class TestComputeATR:
    def test_atr_is_non_negative(self):
        df = make_ohlcv()
        atr = compute_atr(df['high'], df['low'], df['close'])
        assert (atr.dropna() >= 0).all()

    def test_atr_higher_on_volatile_prices(self):
        """Higher volatility should produce higher ATR."""
        close_low = pd.Series([100.0] * 50)
        close_high = pd.Series([100 + i % 10 * 5.0 for i in range(50)])
        high_low = close_low + 0.5
        high_high = close_high + 5.0
        low_low = close_low - 0.5
        low_high = close_high - 5.0

        atr_low = compute_atr(high_low, low_low, close_low, period=5)
        atr_high = compute_atr(high_high, low_high, close_high, period=5)

        assert atr_high.dropna().mean() > atr_low.dropna().mean()


# ─── build_feature_matrix Tests ───────────────────────────────────────────────

class TestBuildFeatureMatrix:
    def test_raises_on_missing_columns(self):
        df = pd.DataFrame({'open': [1], 'close': [1]})
        with pytest.raises(ValueError, match="Missing OHLCV columns"):
            build_feature_matrix(df)

    def test_output_has_expected_core_columns(self):
        df = make_ohlcv()
        config = DEFAULT_CONFIG
        features = build_feature_matrix(df, config)
        # Check for presence of some core expected features
        expected_cols = ['rsi', 'macd_line', 'bb_upper', 'atr', 'volume_ratio', f'ema_{config.ema_periods[0]}']
        for col in expected_cols:
            assert col in features.columns, f"Missing column: {col}"

    def test_output_dtype_is_float64(self):
        df = make_ohlcv()
        features = build_feature_matrix(df)
        assert (features.dtypes == 'float64').all()

    def test_same_row_count_as_input(self):
        df = make_ohlcv(200)
        features = build_feature_matrix(df)
        assert len(features) == len(df)

    def test_ema_cross_signal_is_binary(self):
        df = make_ohlcv()
        config = DEFAULT_CONFIG
        p1, p2 = config.ema_periods[0], config.ema_periods[1]
        features = build_feature_matrix(df, config)
        valid = features[f'ema_{p1}_{p2}_cross'].dropna()
        assert valid.isin([0.0, 1.0]).all()

    def test_respects_custom_config(self):
        df = make_ohlcv()
        config = IndicatorConfig(rsi_period=7, ema_periods=(5, 10))
        features = build_feature_matrix(df, config)
        assert 'ema_5' in features.columns
        assert 'ema_10' in features.columns
        assert 'ema_9' not in features.columns  # not in custom config


# ─── label_direction Tests ────────────────────────────────────────────────────

class TestLabelDirection:
    def test_returns_series_same_length(self):
        close = make_close()
        labels = label_direction(close, horizon=1)
        assert len(labels) == len(close)

    def test_last_horizon_rows_are_nan(self):
        close = make_close(100)
        labels = label_direction(close, horizon=5)
        assert labels.iloc[-5:].isna().all()

    def test_valid_rows_only_contain_0_1_2(self):
        close = make_close()
        labels = label_direction(close, horizon=1)
        valid = labels.dropna()
        assert valid.isin([0.0, 1.0, 2.0]).all()

    def test_strong_uptrend_majority_labeled_up(self):
        prices = pd.Series([100 + i * 0.5 for i in range(200)])
        labels = label_direction(prices, horizon=1, threshold_pct=0.1)
        valid = labels.dropna()
        # Most should be UP (2) in a strong uptrend
        assert (valid == 2.0).mean() > 0.5

    def test_strong_downtrend_majority_labeled_down(self):
        prices = pd.Series([200 - i * 0.5 for i in range(200)])
        labels = label_direction(prices, horizon=1, threshold_pct=0.1)
        valid = labels.dropna()
        assert (valid == 0.0).mean() > 0.5

    def test_high_threshold_produces_mostly_sideways(self):
        """With a very high threshold, most moves are SIDEWAYS."""
        close = make_close()
        labels = label_direction(close, horizon=1, threshold_pct=50.0)
        valid = labels.dropna()
        assert (valid == 1.0).mean() > 0.9
