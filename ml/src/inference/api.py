"""
ML Service FastAPI Application
================================
Exposes inference endpoints consumed by the Node.js API gateway.
"""

from __future__ import annotations
import os
from contextlib import asynccontextmanager
from typing import Optional, Any
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
import pandas as pd

from ..features.technical_indicators import build_feature_matrix, label_direction
from ..models.xgboost_model import XGBoostPriceModel

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class OHLCVRecord(BaseModel):
    ts: str
    open: float
    high: float
    low: float
    close: float = Field(gt=0)
    volume: float = Field(ge=0)

class PredictionRequest(BaseModel):
    symbol: str = Field(examples=['BTC-USD'])
    horizon: str = Field(pattern='^(1h|4h|24h)$')
    candles: list[OHLCVRecord] = Field(min_length=60)
    sentiment_score: Optional[float] = Field(None, ge=-1.0, le=1.0)
    fear_greed_score: Optional[float] = Field(None, ge=0.0, le=100.0)

class PredictionResponse(BaseModel):
    symbol: str
    horizon: str
    direction: str
    confidence: float
    trend_strength: str
    price_low: float
    price_high: float
    probabilities: dict[str, float]
    model_version: str

class HealthResponse(BaseModel):
    status: str
    models_loaded: list[str]
    version: str

# ─── Model Registry ───────────────────────────────────────────────────────────

MODELS: dict[str, XGBoostPriceModel] = {}
MODEL_DIR = os.environ.get('MODEL_DIR', os.path.join(os.getcwd(), 'models'))

HORIZON_STEPS = {'1h': 1, '4h': 4, '24h': 24}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load models on startup
    for horizon in ['1h', '4h', '24h']:
        model_path = os.path.join(MODEL_DIR, f'xgb_{horizon}')
        if os.path.exists(model_path):
            try:
                MODELS[horizon] = XGBoostPriceModel.load(model_path)
                print(f"[ml-api] Loaded XGBoost model for {horizon}")
            except Exception as e:
                print(f"[ml-api] Failed to load {horizon} model: {e}")
        else:
            print(f"[ml-api] No model found for {horizon} at {model_path} — needs training")
    yield
    MODELS.clear()

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title='CryptoIntelligence ML Service',
    version='1.0.0',
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_methods=['GET', 'POST'],
    allow_headers=['*'],
)

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get('/health', response_model=HealthResponse)
def health():
    return HealthResponse(
        status='ok' if MODELS else 'degraded',
        models_loaded=list(MODELS.keys()),
        version='1.0.0',
    )


@app.post('/predict', response_model=PredictionResponse)
def predict(req: PredictionRequest):
    """
    Run XGBoost ensemble prediction for a given symbol and horizon.
    Requires at least 60 candles for meaningful indicator warm-up.
    """
    model = MODELS.get(req.horizon)
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Model for horizon '{req.horizon}' not loaded. Run training first.",
        )

    # Build OHLCV DataFrame
    df = pd.DataFrame([c.model_dump() for c in req.candles])
    df['ts'] = pd.to_datetime(df['ts'])
    df = df.set_index('ts').sort_index()

    # Compute technical features
    try:
        features = build_feature_matrix(df)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Inject external signals as constant features for the sequence
    if req.sentiment_score is not None:
        features['sentiment_score'] = req.sentiment_score
    if req.fear_greed_score is not None:
        features['fear_greed_normalized'] = req.fear_greed_score / 100.0

    # Drop NaN rows (warm-up period) and take the tail for inference
    features_clean = features.dropna()
    if len(features_clean) < 10:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient non-NaN rows after indicator warm-up: {len(features_clean)}",
        )

    # Run inference
    try:
        result = model.predict_proba(features_clean)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

    # Estimate price range from ATR
    last_close = float(df['close'].iloc[-1])
    atr = float(features_clean['atr'].iloc[-1]) if 'atr' in features_clean else last_close * 0.02
    horizon_multiplier = HORIZON_STEPS.get(req.horizon, 1)

    price_low = last_close - atr * horizon_multiplier
    price_high = last_close + atr * horizon_multiplier

    return PredictionResponse(
        symbol=req.symbol,
        horizon=req.horizon,
        direction=result['direction'],
        confidence=result['confidence'],
        trend_strength=result['trend_strength'],
        price_low=round(price_low, 2),
        price_high=round(price_high, 2),
        probabilities=result['probabilities'],
        model_version=model.MODEL_VERSION,
    )


@app.get('/features/importance/{horizon}')
def feature_importance(horizon: str):
    """Return feature importance for a given horizon model."""
    model = MODELS.get(horizon)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Model '{horizon}' not loaded")
    return {'horizon': horizon, 'importance': model.get_feature_importance()}
