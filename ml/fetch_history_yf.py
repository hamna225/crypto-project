import yfinance as yf
import sqlite3
import pandas as pd
from pathlib import Path

# Connect to database
DB_PATH = Path(__file__).parent.parent / 'api' / 'data' / 'crypto_intelligence.sqlite'
print(f"Connecting to DB at: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Create table if missing
cursor.execute("""
    CREATE TABLE IF NOT EXISTS ohlcv_candles (
        symbol TEXT,
        exchange TEXT DEFAULT 'coinbase',
        interval TEXT DEFAULT '1h',
        ts TEXT,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        volume REAL,
        PRIMARY KEY (symbol, interval, ts)
    )
""")
conn.commit()

# Ensure we map yfinance ticker to our internal ticker
symbols = {'BTC-USD': 'BTC-USD', 'ETH-USD': 'ETH-USD'}

for internal_symbol, yf_symbol in symbols.items():
    print(f"\nFetching {yf_symbol} history via yfinance...")
    
    # 730 days is the maximum history for 1h granularity in yfinance
    df = yf.download(yf_symbol, interval='1h', period='700d')
    
    if df.empty:
        print(f"No data returned for {yf_symbol}")
        continue
    
    # Flatten multi-index columns if present (from new yfinance versions)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    
    # yfinance columns are capitalised: Open, High, Low, Close, Volume
    inserted = 0
    for ts, row in df.iterrows():
        try:
            ts_iso = ts.strftime('%Y-%m-%dT%H:%M:%S.000Z')
            cursor.execute("""
                INSERT OR IGNORE INTO ohlcv_candles 
                (symbol, exchange, interval, ts, open, high, low, close, volume) 
                VALUES (?, 'coinbase', '1h', ?, ?, ?, ?, ?, ?)
            """, (
                internal_symbol, 
                ts_iso, 
                float(row['Open']), 
                float(row['High']), 
                float(row['Low']), 
                float(row['Close']), 
                float(row['Volume'])
            ))
            inserted += cursor.rowcount
        except Exception as e:
            pass
            
    conn.commit()
    print(f"Inserted {inserted} rows for {internal_symbol}. Total available records: {len(df)}")

conn.close()
print("\n[Done] Database populated with historical data.")
