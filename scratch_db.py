import sqlite3
import pandas as pd

c = sqlite3.connect('api/data/crypto_intelligence.sqlite')
df = pd.read_sql("SELECT ts, open, close, volume FROM ohlcv_candles WHERE symbol='BTC-USD' ORDER BY ts DESC LIMIT 10", c)
print(df)
df_all = pd.read_sql("SELECT count(*) FROM ohlcv_candles WHERE symbol='BTC-USD'", c)
print("Total BTC rows:", df_all)
