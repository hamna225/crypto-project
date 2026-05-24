"""
Unit Tests — XGBoost Price Prediction Model
============================================
Uses synthetic data to test training, inference, serialization,
and edge-case handling without requiring real market data.
"""

import pytest
import numpy as np
import pandas as pd
import tempfile
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.models.xgboost_model import XGBoostPriceModel, XGBConfig, ModelMetrics
from src.features.technical_indicators import build_feature_matrix, label_direction, IndicatorConfig


# ─── Fixtures ─────────────────────────────────────────────────────────────────

def make_synthetic_dataset(n: int = 500, seed: int = 42):
    """Generate a minimal but realistic OHLCV + feature + label set."""
    rng = np.random.default_rng(seed)
    close = pd.Series(100 * np.exp(np.cumsum(rng.normal(0.001, 0.02, n))))
    spread = close * 0.005
    df = pd.DataFrame({
        'open':   close + rng.normal(0, 0.001, n) * close,
        'high':   close + spread,
        'low':    close - spread,
        'close':  close,
        'volume': rng.uniform(1000, 50000, n),
    })
    X = build_feature_matrix(df, config=IndicatorConfig(
        volatility_window_7d=7,
        volatility_window_30d=30,
        rsi_period=14,
        bb_period=20,
        volume_ma_period=20
    ))
    y = label_direction(close, horizon=1, threshold_pct=0.3)
    return X, y


@pytest.fixture(scope='module')
def trained_model():
    """Shared trained model for inference tests — avoids repeated training."""
    X, y = make_synthetic_dataset()
    model = XGBoostPriceModel(XGBConfig(n_estimators=20, early_stopping_rounds=5))
    model.fit(X, y)
    return model, X, y


# ─── Initialization ───────────────────────────────────────────────────────────

class TestXGBoostModelInit:
    def test_is_not_fitted_on_init(self):
        model = XGBoostPriceModel()
        assert model.is_fitted is False

    def test_predict_before_fit_raises_runtime_error(self):
        model = XGBoostPriceModel()
        X, _ = make_synthetic_dataset(100)
        with pytest.raises(RuntimeError, match="must be trained"):
            model.predict_proba(X)

    def test_feature_importance_before_fit_raises(self):
        model = XGBoostPriceModel()
        with pytest.raises(RuntimeError, match="must be trained"):
            model.get_feature_importance()

    def test_custom_config_is_stored(self):
        config = XGBConfig(n_estimators=100, max_depth=3)
        model = XGBoostPriceModel(config)
        assert model.config.n_estimators == 100
        assert model.config.max_depth == 3


# ─── Training ─────────────────────────────────────────────────────────────────

class TestXGBoostModelFit:
    def test_fit_returns_model_metrics(self):
        X, y = make_synthetic_dataset()
        model = XGBoostPriceModel(XGBConfig(n_estimators=10))
        metrics = model.fit(X, y)
        assert isinstance(metrics, ModelMetrics)

    def test_is_fitted_after_training(self):
        X, y = make_synthetic_dataset()
        model = XGBoostPriceModel(XGBConfig(n_estimators=10))
        model.fit(X, y)
        assert model.is_fitted is True

    def test_metrics_accuracy_is_valid_probability(self):
        X, y = make_synthetic_dataset()
        model = XGBoostPriceModel(XGBConfig(n_estimators=10))
        metrics = model.fit(X, y)
        assert 0.0 <= metrics.accuracy <= 1.0

    def test_metrics_f1_is_valid(self):
        X, y = make_synthetic_dataset()
        model = XGBoostPriceModel(XGBConfig(n_estimators=10))
        metrics = model.fit(X, y)
        assert 0.0 <= metrics.f1_weighted <= 1.0

    def test_metrics_has_all_three_classes(self):
        X, y = make_synthetic_dataset()
        model = XGBoostPriceModel(XGBConfig(n_estimators=10))
        metrics = model.fit(X, y)
        assert set(metrics.f1_per_class.keys()) == {'DOWN', 'SIDEWAYS', 'UP'}

    def test_feature_names_captured_after_fit(self):
        X, y = make_synthetic_dataset()
        model = XGBoostPriceModel(XGBConfig(n_estimators=10))
        model.fit(X, y)
        assert len(model._feature_names) > 0
        assert 'rsi' in model._feature_names

    def test_fit_raises_with_too_few_samples(self):
        X, y = make_synthetic_dataset(50)  # only 50 rows, need ≥100 after NaN drop
        model = XGBoostPriceModel(XGBConfig(n_estimators=5))
        with pytest.raises(ValueError, match="Insufficient training"):
            model.fit(X, y)

    def test_fit_ignores_nan_rows_gracefully(self):
        """NaN rows in features/labels should be silently dropped, not crash."""
        X, y = make_synthetic_dataset(300)
        # Manually inject extra NaNs
        X.iloc[:20, :] = np.nan
        model = XGBoostPriceModel(XGBConfig(n_estimators=10))
        # Should still train without error
        metrics = model.fit(X, y)
        assert isinstance(metrics, ModelMetrics)


# ─── Inference ────────────────────────────────────────────────────────────────

class TestXGBoostModelPredict:
    def test_predict_returns_required_keys(self, trained_model):
        model, X, _ = trained_model
        X_clean = X.dropna()
        result = model.predict_proba(X_clean)
        assert set(result.keys()) == {'direction', 'confidence', 'trend_strength', 'probabilities'}

    def test_direction_is_valid_class(self, trained_model):
        model, X, _ = trained_model
        result = model.predict_proba(X.dropna())
        assert result['direction'] in {'UP', 'DOWN', 'SIDEWAYS'}

    def test_confidence_is_0_to_100(self, trained_model):
        model, X, _ = trained_model
        result = model.predict_proba(X.dropna())
        assert 0.0 <= result['confidence'] <= 100.0

    def test_trend_strength_is_valid(self, trained_model):
        model, X, _ = trained_model
        result = model.predict_proba(X.dropna())
        assert result['trend_strength'] in {'STRONG', 'MODERATE', 'WEAK'}

    def test_probabilities_sum_to_100(self, trained_model):
        model, X, _ = trained_model
        result = model.predict_proba(X.dropna())
        total = sum(result['probabilities'].values())
        assert abs(total - 100.0) < 0.5  # allow minor float rounding

    def test_probabilities_has_all_three_classes(self, trained_model):
        model, X, _ = trained_model
        result = model.predict_proba(X.dropna())
        assert set(result['probabilities'].keys()) == {'UP', 'DOWN', 'SIDEWAYS'}

    def test_predict_raises_on_missing_features(self, trained_model):
        model, X, _ = trained_model
        # Drop a required feature column
        X_broken = X.dropna().drop(columns=['rsi'])
        with pytest.raises(ValueError, match="Missing features"):
            model.predict_proba(X_broken)

    def test_strong_trend_classification_at_high_confidence(self):
        assert XGBoostPriceModel._classify_trend(80.0) == 'STRONG'

    def test_moderate_trend_classification(self):
        assert XGBoostPriceModel._classify_trend(60.0) == 'MODERATE'

    def test_weak_trend_classification_at_low_confidence(self):
        assert XGBoostPriceModel._classify_trend(45.0) == 'WEAK'

    def test_trend_strength_boundaries(self):
        assert XGBoostPriceModel._classify_trend(75.0) == 'STRONG'
        assert XGBoostPriceModel._classify_trend(74.9) == 'MODERATE'
        assert XGBoostPriceModel._classify_trend(55.0) == 'MODERATE'
        assert XGBoostPriceModel._classify_trend(54.9) == 'WEAK'


# ─── Feature Importance ───────────────────────────────────────────────────────

class TestFeatureImportance:
    def test_returns_dict_with_all_features(self, trained_model):
        model, X, _ = trained_model
        importance = model.get_feature_importance()
        assert isinstance(importance, dict)
        assert len(importance) == len(model._feature_names)

    def test_importance_values_are_non_negative(self, trained_model):
        model, _, _ = trained_model
        importance = model.get_feature_importance()
        assert all(v >= 0 for v in importance.values())

    def test_importance_is_sorted_descending(self, trained_model):
        model, _, _ = trained_model
        importance = model.get_feature_importance()
        values = list(importance.values())
        assert values == sorted(values, reverse=True)


# ─── Serialization ────────────────────────────────────────────────────────────

class TestModelSerialization:
    def test_save_and_load_roundtrip(self):
        X, y = make_synthetic_dataset()
        model = XGBoostPriceModel(XGBConfig(n_estimators=10))
        model.fit(X, y)
        X_clean = X.dropna()
        original_result = model.predict_proba(X_clean)

        with tempfile.TemporaryDirectory() as tmpdir:
            model.save(tmpdir)

            # Verify expected files exist
            assert os.path.exists(os.path.join(tmpdir, 'xgb_model.joblib'))
            assert os.path.exists(os.path.join(tmpdir, 'xgb_scaler.joblib'))
            assert os.path.exists(os.path.join(tmpdir, 'xgb_meta.json'))

            # Load and predict
            loaded_model = XGBoostPriceModel.load(tmpdir)
            loaded_result = loaded_model.predict_proba(X_clean)

        # Predictions must be identical after load
        assert original_result['direction'] == loaded_result['direction']
        assert abs(original_result['confidence'] - loaded_result['confidence']) < 0.01

    def test_loaded_model_preserves_feature_names(self):
        X, y = make_synthetic_dataset()
        model = XGBoostPriceModel(XGBConfig(n_estimators=10))
        model.fit(X, y)

        with tempfile.TemporaryDirectory() as tmpdir:
            model.save(tmpdir)
            loaded = XGBoostPriceModel.load(tmpdir)

        assert loaded._feature_names == model._feature_names

    def test_loaded_model_is_fitted(self):
        X, y = make_synthetic_dataset()
        model = XGBoostPriceModel(XGBConfig(n_estimators=10))
        model.fit(X, y)

        with tempfile.TemporaryDirectory() as tmpdir:
            model.save(tmpdir)
            loaded = XGBoostPriceModel.load(tmpdir)

        assert loaded.is_fitted is True
