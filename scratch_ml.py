import requests
import json
import sqlite3
import pandas as pd

c = sqlite3.connect('api/data/crypto_intelligence.sqlite')
df = pd.read_sql("SELECT ts as ts, open, high, low, close, volume FROM ohlcv_candles WHERE symbol='BTC-USD' ORDER BY ts DESC LIMIT 300", c)
df = df.iloc[::-1] # reverse

candles = df.to_dict('records')

payload = {
    "symbol": "BTC-USD",
    "horizon": "1h",
    "candles": candles
}

try:
    res = requests.post("http://127.0.0.1:8000/predict", json=payload)
    print(res.status_code)
    print(res.text)
except Exception as e:
    print(e)
