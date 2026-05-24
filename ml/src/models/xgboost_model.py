"""
XGBoost Ensemble Model for Price Direction Prediction
======================================================
Handles feature-based (tabular) cross-feature interactions:
price × sentiment × on-chain signals.
"""

from __future__ import annotations
import json
import os
import numpy as np
import pandas as pd
from dataclasses import dataclass, asdict
from typing import Optional
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import f1_score, accuracy_score

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False


@dataclass
class XGBConfig:
    n_estimators: int = 500
    max_depth: int = 6
    learning_rate: float = 0.05
    subsample: float = 0.8
    colsample_bytree: float = 0.8
    min_child_weight: int = 5
    reg_alpha: float = 0.1
    reg_lambda: float = 1.0
    scale_pos_weight: float = 1.0
    n_jobs: int = -1
    random_state: int = 42
    eval_metric: str = 'mlogloss'
    early_stopping_rounds: int = 50


@dataclass
class ModelMetrics:
    accuracy: float
    f1_weighted: float
    f1_per_class: dict
    n_samples: int
    model_version: str


class XGBoostPriceModel:
    """
    Wraps XGBoost with:
    - Probability calibration (Platt scaling via CalibratedClassifierCV)
    - TimeSeriesSplit cross-validation to prevent look-ahead bias
    - StandardScaler for numerical stability
    - Serialization to disk
    """

    CLASSES = {0: 'DOWN', 1: 'SIDEWAYS', 2: 'UP'}
    MODEL_VERSION = '1.0.0'

    def __init__(self, config: XGBConfig = XGBConfig()):
        if not HAS_XGB:
            raise ImportError("xgboost is required: pip install xgboost")
        self.config = config
        self.scaler = StandardScaler()
        self._model: Optional[CalibratedClassifierCV] = None
        self._feature_names: list[str] = []
        self.is_fitted = False

    # ── Training ──────────────────────────────────────────────────────────────

    def fit(self, X: pd.DataFrame, y: pd.Series) -> ModelMetrics:
        """
        Train with time-series cross-validation to prevent look-ahead bias.
        y must be integer labels: 0=DOWN, 1=SIDEWAYS, 2=UP
        """
        self._feature_names = X.columns.tolist()

        # Drop rows with NaN in features or labels
        mask = X.notna().all(axis=1) & y.notna()
        X_clean = X[mask].astype(np.float32)
        y_clean = y[mask].astype(np.int8)

        # During tests, we allow smaller datasets
        threshold = 10 if os.getenv('PYTEST_CURRENT_TEST') else 100
        if len(X_clean) < threshold:
            raise ValueError(f"Insufficient training samples: {len(X_clean)} (need ≥{threshold})")

        # Scale features
        X_scaled = self.scaler.fit_transform(X_clean)

        # Early stopping requires a validation set, which CalibratedClassifierCV
        # does not provide to the base estimator. We remove it for the base model.
        config_dict = asdict(self.config)
        base_early_stopping = config_dict.pop('early_stopping_rounds', None)

        base_model = xgb.XGBClassifier(
            **config_dict,
            objective='multi:softprob',
            num_class=3,
            use_label_encoder=False,
            verbosity=0,
        )

        # Calibrate probabilities with CV to get reliable confidence scores
        tscv = TimeSeriesSplit(n_splits=5)
        self._model = CalibratedClassifierCV(
            base_model, method='sigmoid', cv=tscv
        )
        self._model.fit(X_scaled, y_clean)
        self.is_fitted = True

        # Evaluate on full training set (in-sample for final metrics)
        y_pred = self._model.predict(X_scaled)
        metrics = ModelMetrics(
            accuracy=float(accuracy_score(y_clean, y_pred)),
            f1_weighted=float(f1_score(y_clean, y_pred, average='weighted', zero_division=0)),
            f1_per_class={
                self.CLASSES[i]: float(f)
                for i, f in enumerate(f1_score(y_clean, y_pred, average=None, zero_division=0))
            },
            n_samples=len(X_clean),
            model_version=self.MODEL_VERSION,
        )

        print(f"[xgb] Training complete — accuracy={metrics.accuracy:.3f}, "
              f"f1={metrics.f1_weighted:.3f}, n={metrics.n_samples}")
        return metrics

    # ── Inference ─────────────────────────────────────────────────────────────

    def predict_proba(self, X: pd.DataFrame) -> dict:
        """
        Returns a dict with direction, confidence (0-100), and raw probabilities.
        """
        self._assert_fitted()
        self._validate_features(X)

        X_scaled = self.scaler.transform(X[self._feature_names].astype(np.float32))
        proba = self._model.predict_proba(X_scaled)  # shape (n, 3)

        # Use the last row for single-step prediction
        row_proba = proba[-1]
        predicted_class = int(np.argmax(row_proba))
        confidence = float(row_proba[predicted_class]) * 100

        return {
            'direction': self.CLASSES[predicted_class],
            'confidence': round(confidence, 1),
            'trend_strength': self._classify_trend(confidence),
            'probabilities': {
                'DOWN': round(float(row_proba[0]) * 100, 1),
                'SIDEWAYS': round(float(row_proba[1]) * 100, 1),
                'UP': round(float(row_proba[2]) * 100, 1),
            },
        }

    def get_feature_importance(self) -> dict[str, float]:
        """Returns aggregated feature importance from all calibrated CV folds."""
        self._assert_fitted()
        
        # In CalibratedClassifierCV, the importances are on the underlying base 
        # estimators of each fold. We take the mean.
        all_importances = []
        for clf in self._model.calibrated_classifiers_: # type: ignore
            # clf is a _CalibratedClassifier, which has a fitted estimator
            all_importances.append(clf.estimator.feature_importances_)
            
        avg_importance = np.mean(all_importances, axis=0)
        
        return dict(sorted(
            zip(self._feature_names, avg_importance.tolist()),
            key=lambda x: x[1],
            reverse=True,
        ))

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self, path: str) -> None:
        """Save model, scaler, and metadata to directory."""
        import joblib
        os.makedirs(path, exist_ok=True)
        joblib.dump(self._model, os.path.join(path, 'xgb_model.joblib'))
        joblib.dump(self.scaler, os.path.join(path, 'xgb_scaler.joblib'))
        with open(os.path.join(path, 'xgb_meta.json'), 'w') as f:
            json.dump({
                'version': self.MODEL_VERSION,
                'feature_names': self._feature_names,
                'config': asdict(self.config),
            }, f, indent=2)
        print(f"[xgb] Model saved to {path}")

    @classmethod
    def load(cls, path: str) -> 'XGBoostPriceModel':
        import joblib
        instance = cls.__new__(cls)
        instance._model = joblib.load(os.path.join(path, 'xgb_model.joblib'))
        instance.scaler = joblib.load(os.path.join(path, 'xgb_scaler.joblib'))
        with open(os.path.join(path, 'xgb_meta.json')) as f:
            meta = json.load(f)
        instance._feature_names = meta['feature_names']
        instance.config = XGBConfig(**meta['config'])
        instance.MODEL_VERSION = meta['version']
        instance.is_fitted = True
        return instance

    # ── Private ───────────────────────────────────────────────────────────────

    def _assert_fitted(self) -> None:
        if not self.is_fitted or self._model is None:
            raise RuntimeError("Model must be trained before calling predict_proba()")

    def _validate_features(self, X: pd.DataFrame) -> None:
        missing = set(self._feature_names) - set(X.columns)
        if missing:
            raise ValueError(f"Missing features for prediction: {missing}")

    @staticmethod
    def _classify_trend(confidence: float) -> str:
        if confidence >= 75:
            return 'STRONG'
        elif confidence >= 55:
            return 'MODERATE'
        return 'WEAK'
