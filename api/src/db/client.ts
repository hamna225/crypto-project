import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

// ─── Database Singletons ──────────────────────────────────────────────────────

let sqliteDb: Database.Database | null = null;
let pgPool: pg.Pool | null = null;

/**
 * Initialize the appropriate database connection based on config.
 */
export async function getDB(): Promise<Database.Database | pg.Pool> {
  if (config.DB_TYPE === 'postgres') {
    if (!pgPool) {
      pgPool = new pg.Pool({
        host: config.PG_HOST,
        port: config.PG_PORT,
        user: config.PG_USER,
        password: config.PG_PASSWORD,
        database: config.PG_DATABASE,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      pgPool.on('error', (err) => {
        console.error('[db] Unexpected error on idle Postgres client', err);
      });

      console.info(`[db] Connected to PostgreSQL at ${config.PG_HOST}:${config.PG_PORT}`);
      
      // Auto-initialize Postgres schema
      await initializeSchema(pgPool as any);
    }
    return pgPool;
  } else {
    if (!sqliteDb) {
      const dbDir = path.dirname(config.DB_PATH);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      sqliteDb = new Database(config.DB_PATH, {
        verbose: config.NODE_ENV === 'development' ? console.log : undefined,
      });

      sqliteDb.pragma('journal_mode = WAL');
      sqliteDb.pragma('synchronous = NORMAL');
      sqliteDb.pragma('foreign_keys = ON');

      console.info(`[db] Connected to SQLite at ${config.DB_PATH}`);
      
      await initializeSchema(sqliteDb);
    }
    return sqliteDb;
  }
}

/**
 * Helper to convert '?' placeholders to '$1, $2, ...' for Postgres
 */
function translateDialect(sql: string): string {
  if (config.DB_TYPE !== 'postgres') return sql;
  let count = 1;
  return sql.replace(/\?/g, () => `$${count++}`);
}

/**
 * Execute a query with multiple rows returning.
 */
export async function query<T>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDB();
  const dialectSql = translateDialect(sql);

  if (db instanceof pg.Pool) {
    const res = await db.query(dialectSql, params);
    return res.rows as T[];
  } else {
    return db.prepare(dialectSql).all(...params) as T[];
  }
}

/**
 * Execute a query returning a single row.
 */
export async function queryOne<T>(sql: string, params: any[] = []): Promise<T | undefined> {
  const db = await getDB();
  const dialectSql = translateDialect(sql);

  if (db instanceof pg.Pool) {
    const res = await db.query(dialectSql, params);
    return res.rows[0] as T | undefined;
  } else {
    return db.prepare(dialectSql).get(...params) as T | undefined;
  }
}

/**
 * Execute a non-returning statement (INSERT, UPDATE, DELETE).
 */
export async function run(sql: string, params: any[] = []): Promise<any> {
  const db = await getDB();
  const dialectSql = translateDialect(sql);

  if (db instanceof pg.Pool) {
    const res = await db.query(dialectSql, params);
    return { changes: res.rowCount, lastInsertRowid: null };
  } else {
    return db.prepare(dialectSql).run(...params);
  }
}

/**
 * Execute multiple statements in a transaction.
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const db = await getDB();
  
  if (db instanceof pg.Pool) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else {
    return fn(); // Simplified for migration
  }
}

/**
 * Get a user setting from the DB.
 */
export async function getSetting(key: string): Promise<string | undefined> {
  const row = await queryOne<{ value: string }>('SELECT value FROM user_settings WHERE key = ?', [key]);
  return row?.value;
}

/**
 * Save a user setting to the DB.
 */
export async function setSetting(key: string, value: string): Promise<void> {
  const sql = config.DB_TYPE === 'postgres' 
    ? 'INSERT INTO user_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP'
    : 'INSERT INTO user_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP';
  
  await run(sql, [key, value]);
}

/**
 * Health-check: verifies DB is reachable.
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  type: string;
  error?: string;
}> {
  try {
    const db = await getDB();
    if (db instanceof pg.Pool) {
      await db.query('SELECT 1');
    } else {
      (db as Database.Database).prepare('SELECT 1').get();
    }
    return {
      connected: true,
      type: config.DB_TYPE,
    };
  } catch (error) {
    return {
      connected: false,
      type: config.DB_TYPE,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Gracefully close database pools.
 */
export async function closePool(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
}

// ─── Schema Initialization ────────────────────────────────────────────────────

async function initializeSchema(db: Database.Database | pg.Pool): Promise<void> {
  console.info('[db] Initializing schema...');

  const isPostgres = db instanceof pg.Pool;
  
  const schemaSql = `
    -- OHLCV Candles
    CREATE TABLE IF NOT EXISTS ohlcv_candles (
        symbol        TEXT NOT NULL,
        exchange      TEXT NOT NULL,
        interval      TEXT NOT NULL,
        ts            TEXT NOT NULL,
        open          REAL NOT NULL,
        high          REAL NOT NULL,
        low           REAL NOT NULL,
        close         REAL NOT NULL,
        volume        REAL NOT NULL,
        created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (symbol, exchange, interval, ts)
    );
    CREATE INDEX IF NOT EXISTS idx_ohlcv_lookup ON ohlcv_candles (symbol, exchange, interval, ts DESC);

    -- Tickers
    CREATE TABLE IF NOT EXISTS tickers (
        symbol               TEXT NOT NULL,
        exchange             TEXT NOT NULL,
        price                REAL NOT NULL,
        price_change_24h     REAL,
        price_change_pct_24h REAL,
        volume_24h           REAL,
        market_cap           REAL,
        updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (symbol, exchange)
    );

    -- Whale Wallets
    CREATE TABLE IF NOT EXISTS whale_wallets (
        id             TEXT PRIMARY KEY,
        address        TEXT NOT NULL,
        chain          TEXT NOT NULL,
        alias          TEXT,
        label          TEXT NOT NULL DEFAULT 'unknown',
        watched_since  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_active      INTEGER NOT NULL DEFAULT 1,
        UNIQUE (address, chain)
    );

    -- Whale Transactions
    CREATE TABLE IF NOT EXISTS whale_transactions (
        tx_hash        TEXT NOT NULL,
        chain          TEXT NOT NULL,
        from_address   TEXT NOT NULL,
        to_address     TEXT NOT NULL,
        from_alias     TEXT,
        to_alias       TEXT,
        token          TEXT NOT NULL,
        token_address  TEXT,
        amount_raw     TEXT,
        amount_usd     REAL,
        direction      TEXT,
        block_number   INTEGER,
        ts             TEXT NOT NULL,
        created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tx_hash, chain, ts)
    );

    -- Sentiment Scores
    CREATE TABLE IF NOT EXISTS sentiment_scores (
        id            TEXT PRIMARY KEY,
        source        TEXT NOT NULL,
        symbol        TEXT,
        score         REAL NOT NULL,
        polarity      TEXT NOT NULL,
        confidence    REAL,
        url           TEXT,
        author_id     TEXT,
        raw_text      TEXT,
        created_at    TEXT NOT NULL,
        processed_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Fear & Greed Index
    CREATE TABLE IF NOT EXISTS fear_greed_index (
        id               TEXT PRIMARY KEY,
        composite_score  INTEGER NOT NULL,
        classification   TEXT NOT NULL,
        components       TEXT NOT NULL,
        official_score   INTEGER,
        computed_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Alerts
    CREATE TABLE IF NOT EXISTS alerts (
        id           TEXT PRIMARY KEY,
        type         TEXT NOT NULL,
        severity     TEXT NOT NULL,
        title        TEXT NOT NULL,
        body         TEXT NOT NULL,
        metadata     TEXT NOT NULL DEFAULT '{}',
        channels     TEXT NOT NULL DEFAULT '[]',
        status       TEXT NOT NULL DEFAULT 'pending',
        created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        delivered_at TEXT
    );

    -- Price Predictions
    CREATE TABLE IF NOT EXISTS price_predictions (
        id             TEXT PRIMARY KEY,
        symbol         TEXT NOT NULL,
        horizon        TEXT NOT NULL,
        direction      TEXT NOT NULL,
        confidence     INTEGER NOT NULL,
        price_low      REAL,
        price_high     REAL,
        trend_strength TEXT NOT NULL,
        model_version  TEXT NOT NULL,
        generated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- User Settings
    CREATE TABLE IF NOT EXISTS user_settings (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const seedSql = `
    INSERT INTO whale_wallets (id, address, chain, alias, label) VALUES
        ('wallet_binance_1', '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', 'ethereum', 'Binance Hot Wallet 1', 'exchange'),
        ('wallet_binance_2', '0xD551234Ae421e3BCBA99A0Da6d736074f22192FF', 'ethereum', 'Binance Hot Wallet 2', 'exchange'),
        ('wallet_coinbase_3', '0xa910f92acdaf488fa6ef02174fb86208ad7722ba', 'ethereum', 'Coinbase 3', 'exchange'),
        ('wallet_coinbase_4', '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3', 'ethereum', 'Coinbase 4', 'exchange'),
        ('wallet_binance_20', '0x28C6c06298d514Db089934071355E5743bf21d60', 'ethereum', 'Binance Hot Wallet 20', 'exchange')
    ON CONFLICT DO NOTHING;
  `;

  if (isPostgres) {
    const client = await (db as pg.Pool).connect();
    try {
      await client.query(schemaSql);
      await client.query(seedSql);
    } finally {
      client.release();
    }
  } else {
    (db as Database.Database).exec(schemaSql);
    (db as Database.Database).exec(seedSql);
  }
  
  console.info('[db] Schema initialization complete.');
}
