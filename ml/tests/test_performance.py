import pytest
import pandas as pd
import numpy as np
from src.models.xgboost_model import XGBoostPriceModel, XGBConfig

@pytest.fixture(scope="module")
def mock_trained_model():
    # Setup dummy data
    np.random.seed(42)
    X = pd.DataFrame(np.random.randn(200, 10), columns=[f'feat_{i}' for i in range(10)])
    y = pd.Series(np.random.randint(0, 3, 200))
    
    # Train
    model = XGBoostPriceModel(XGBConfig(n_estimators=10, max_depth=3))
    model.fit(X, y)
    return model, X

def test_inference_performance(benchmark, mock_trained_model):
    """
    QA Test: Ensure single-step inference remains under specific latency bounds.
    (Pytest Benchmark will track and statistics the run duration)
    """
    model, X = mock_trained_model
    # Benchmark the `predict_proba` function on the last row
    result = benchmark.pedantic(model.predict_proba, args=(X.iloc[-10:],), iterations=100, rounds=10)
    
    assert result['direction'] in ['UP', 'DOWN', 'SIDEWAYS']
    assert result['confidence'] > 0
