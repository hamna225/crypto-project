import sqlite3
import requests
import time
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / 'api' / 'data' / 'crypto_intelligence.sqlite'
print(f"Connecting to DB at: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

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

# We need ~1000 hours of data for BTC-USD and ETH-USD
symbols = ['BTC-USD', 'ETH-USD']

def fetch_and_store(symbol):
    print(f"\nFetching {symbol} history...")
    end_time = int(time.time())
    total_inserted = 0
    
    # Fetch 4 chunks of 300 hours each
    for _ in range(5):
        # 300 hours * 3600 seconds = 1,080,000 seconds
        start_time = end_time - (300 * 3600)
        
        try:
            start_iso = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(start_time))
            end_iso = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(end_time))
            url = f"https://api.exchange.coinbase.com/products/{symbol}/candles?granularity=3600&start={start_iso}&end={end_iso}"
            res = requests.get(url, headers={'User-Agent': 'DarkSideCrypto/1.0'})
            res.raise_for_status()
            data = res.json()
            
            if not data:
                break
                
            inserted_in_chunk = 0
            for candle in data:
                # Format: [ timestamp, low, high, open, close, volume ]
                ts_unix = candle[0]
                ts_iso = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(ts_unix))
                try:
                    cursor.execute("""
                        INSERT OR IGNORE INTO ohlcv_candles 
                        (symbol, ts, open, high, low, close, volume) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (symbol, ts_iso, candle[3], candle[2], candle[1], candle[4], candle[5]))
                    inserted_in_chunk += cursor.rowcount
                except Exception as e:
                    print(e)
            
            conn.commit()
            total_inserted += inserted_in_chunk
            print(f"  Inserted {inserted_in_chunk} candles. Time range up to {time.strftime('%Y-%m-%d', time.gmtime(start_time))}...")
            
            # Step back in time
            end_time = start_time
            time.sleep(0.5) # respect rate limit
        except Exception as e:
            print(f"Error fetching chunk: {e}")
            break
            
    print(f"Total inserted for {symbol}: {total_inserted}")

for s in symbols:
    fetch_and_store(s)

conn.close()
print("\nDone. DB populated with history.")
