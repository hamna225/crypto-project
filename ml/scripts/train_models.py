#!/usr/bin/env python3
"""
ML Model Training Pipeline
==========================
Trains XGBoost models for 3 prediction horizons using historical OHLCV data.
Run this script after loading some historical data into the database.

Usage:
    python scripts/train_models.py
    # Or with custom settings:
    python scripts/train_models.py --symbols BTC-USD,ETH-USD --horizons 1h,4h --min-samples 500
"""

from __future__ import annotations
import sys
import os
import argparse
from pathlib import Path
import pandas as pd
import sqlite3

# Ensure we can import from src/
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from features.technical_indicators import build_feature_matrix, label_direction
from models.xgboost_model import XGBoostPriceModel, XGBConfig

# Database connection
def get_db_connection():
    """Connect to Local SQLite."""
    db_path = Path(__file__).parent.parent.parent / 'api' / 'data' / 'crypto_intelligence.sqlite'
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row  # behave somewhat like dict
    return conn


def fetch_ohlcv_data(symbol: str, limit: int = 5000) -> pd.DataFrame:
    """
    Fetch historical OHLCV candles from database for a symbol.
    Returns DataFrame with columns: ts, open, high, low, close, volume.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            """
            SELECT ts, open, high, low, close, volume
            FROM ohlcv_candles
            WHERE symbol = ? AND interval = '1h'
            ORDER BY ts ASC
            LIMIT ?
            """,
            (symbol, limit),
        )
        rows = cursor.fetchall()
        # Convert sqlite3.Row back to plain dicts for Pandas
        rows = [dict(row) for row in rows]
    finally:
        cursor.close()
        conn.close()
    
    if not rows:
        raise ValueError(f"No OHLCV data found for {symbol}")
    
    df = pd.DataFrame(rows)
    df['ts'] = pd.to_datetime(df['ts'])
    df = df.set_index('ts').astype('float64')
    
    print(f"[train] Loaded {len(df)} candles for {symbol}")
    return df


def train_horizon_model(symbol: str, df: pd.DataFrame, horizon: str, model_dir: Path) -> None:
    """Train a single horizon model and save it."""
    horizon_to_steps = {'1h': 1, '4h': 4, '24h': 24}
    steps = horizon_to_steps[horizon]
    
    print(f"\n[train] {symbol} {horizon} (shift={steps})")
    
    # Build features
    features = build_feature_matrix(df)
    
    # Label data
    labels = label_direction(df['close'], horizon=steps, threshold_pct=0.5)
    
    # Align and drop NaN
    X = features.copy()
    y = labels.copy()
    mask = X.notna().all(axis=1) & y.notna()
    X_clean = X[mask]
    y_clean = y[mask]
    
    if len(X_clean) < 100:
        print(f"[train] ⚠️  Only {len(X_clean)} samples after cleaning — skipping")
        return
    
    # Train model
    model = XGBoostPriceModel(config=XGBConfig(n_estimators=500, max_depth=6))
    metrics = model.fit(X_clean, y_clean)
    
    # Save model
    model_path = model_dir / f'xgb_{horizon}'
    model_path.mkdir(parents=True, exist_ok=True)
    model.save(model_path)
    print(f"[train] ✅ Saved to {model_path}")
    print(f"       Accuracy: {metrics.accuracy:.2%} | F1: {metrics.f1_weighted:.2%}")


def main():
    parser = argparse.ArgumentParser(description='Train XGBoost models for crypto price prediction')
    parser.add_argument('--symbols', default='BTC-USD,ETH-USD', help='Comma-separated list of symbols')
    parser.add_argument('--horizons', default='1h,4h,24h', help='Comma-separated list of horizons')
    parser.add_argument('--min-samples', type=int, default=500, help='Minimum samples per symbol')
    parser.add_argument('--model-dir', default='./models', help='Output directory for models')
    
    args = parser.parse_args()
    
    symbols = [s.strip() for s in args.symbols.split(',')]
    horizons = [h.strip() for h in args.horizons.split(',')]
    model_dir = Path(args.model_dir)
    
    print(f"[train] Starting ML training pipeline")
    print(f"[train] Symbols: {symbols}")
    print(f"[train] Horizons: {horizons}")
    print(f"[train] Model dir: {model_dir}")
    print(f"[train] Min samples: {args.min_samples}")
    
    for symbol in symbols:
        try:
            df = fetch_ohlcv_data(symbol, limit=10000)
            if len(df) < args.min_samples:
                print(f"[train] ⚠️  {symbol}: Only {len(df)} samples (need ≥{args.min_samples})")
                continue
            
            for horizon in horizons:
                train_horizon_model(symbol, df, horizon, model_dir)
        
        except Exception as e:
            print(f"[train] ❌ {symbol}: {e}")
            continue
    
    print(f"\n[train] ✅ Training complete")


if __name__ == '__main__':
    main()
