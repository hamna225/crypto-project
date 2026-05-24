import { ethers } from 'ethers';
import { EventEmitter } from 'node:events';
import type { WhaleTransaction, WhaleWallet, Chain, WalletDirection } from '../../../shared/types/index.js';
import { REDIS_CHANNELS } from '../../../shared/types/index.js';
import { config } from '../config.js';
import { resolveConfig } from '../utils/config-resolver.js';
import { getRedis, isWhaleAddress, addWhaleAddress, syncWhaleAddressSet, redisKey } from '../db/redis.js';
import { query, run, withTransaction } from '../db/client.js';

// ─── Whale Wallet Tracker ─────────────────────────────────────────────────────
// Subscribes to Alchemy's WebSocket and checks every pending transaction
// against the O(1) Redis Set of whale addresses.
//
// Flow:
//   Alchemy WS → pending tx → Redis O(1) lookup → USD conversion
//   → threshold check → alert payload → Redis Pub/Sub → Alert Engine

// Known exchange hot wallet addresses for direction inference
const EXCHANGE_ADDRESSES = new Set<string>([
  '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be', // Binance 1
  '0xd551234ae421e3bcba99a0da6d736074f22192ff', // Binance 2
  '0xa910f92acdaf488fa6ef02174fb86208ad7722ba', // Coinbase 3
  '0x71660c4005ba85c37ccec55d0c4493e66fe775d3', // Coinbase 4
  '0x28c6c06298d514db089934071355e5743bf21d60', // Binance 20
]);

export interface WhaleTrackerEvents {
  whaleTx: (tx: WhaleTransaction) => void;
  error: (error: Error) => void;
  synced: (count: number) => void;
}

export declare interface WhaleTrackerService {
  on<K extends keyof WhaleTrackerEvents>(event: K, listener: WhaleTrackerEvents[K]): this;
  emit<K extends keyof WhaleTrackerEvents>(event: K, ...args: Parameters<WhaleTrackerEvents[K]>): boolean;
}

export class WhaleTrackerService extends EventEmitter {
  private provider: ethers.WebSocketProvider | null = null;
  private isRunning = false;
  private walletAliasMap = new Map<string, string>(); // address → alias

  // ── Public API ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const alchemyKey = await resolveConfig('ALCHEMY_PROJECT_ID');
    if (!alchemyKey) {
      console.warn('[whale-tracker] ALCHEMY_PROJECT_ID not set — skipping ETH whale tracking');
      return;
    }

    if (this.isRunning) return;

    await this.syncWatchList();
    await this.connectAlchemyWs();
    this.isRunning = true;

    // Resync the watch list every 6 hours to catch newly added wallets
    setInterval(() => void this.syncWatchList(), 6 * 60 * 60 * 1000);
  }

  stop(): void {
    this.isRunning = false;
    if (this.provider) {
      void this.provider.destroy();
      this.provider = null;
    }
  }

  async addWallet(wallet: Omit<WhaleWallet, 'id' | 'watchedSince'>): Promise<WhaleWallet> {
    const result = await query<WhaleWallet>(
      `INSERT INTO whale_wallets (address, chain, alias, label, is_active)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (address, chain) DO UPDATE SET
         alias     = excluded.alias,
         label     = excluded.label,
         is_active = excluded.is_active
       RETURNING *`,
      [wallet.address.toLowerCase(), wallet.chain, wallet.alias, wallet.label, wallet.isActive ? 1 : 0],
    );

    const saved = result[0]!;

    // Immediately add to Redis set so it's effective for next tx
    await addWhaleAddress(getRedis(), saved.address, saved.chain);

    if (saved.alias) {
      this.walletAliasMap.set(saved.address, saved.alias);
    }

    return saved;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async syncWatchList(): Promise<void> {
    const wallets = await query<{ address: string; chain: string; alias: string | null }>(
      'SELECT address, chain, alias FROM whale_wallets WHERE is_active = 1',
    );

    // Rebuild Redis O(1) lookup sets
    await syncWhaleAddressSet(
      getRedis(),
      wallets.map((w) => ({ address: w.address, chain: w.chain })),
    );

    // Rebuild alias map
    this.walletAliasMap.clear();
    for (const w of wallets) {
      if (w.alias) this.walletAliasMap.set(w.address, w.alias);
    }

    console.info(`[whale-tracker] Synced ${wallets.length} watched addresses`);
    this.emit('synced', wallets.length);
  }

  private async connectAlchemyWs(): Promise<void> {
    const alchemyKey = await resolveConfig('ALCHEMY_PROJECT_ID');
    const wsUrl = `wss://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    try {
      this.provider = new ethers.WebSocketProvider(wsUrl);

      // Prevent unhandled 'error' events on the underlying ws from crashing Node
      if (this.provider.websocket && typeof (this.provider.websocket as any).on === 'function') {
        (this.provider.websocket as any).on('error', (err: any) => {
          console.error('[whale-tracker] Underlying WS error:', err.message);
        });
      }

      this.provider.on('pending', (txHash: string) => {
        void this.processPendingTx(txHash);
      });

      this.provider.on('error', (err: Error) => {
        console.error('[whale-tracker] Provider error:', err.message);
        this.emit('error', err);
      });

      console.info('[whale-tracker] Connected to Alchemy WebSocket (ETH mainnet)');
    } catch (err) {
      console.error('[whale-tracker] Failed to connect to Alchemy:', err instanceof Error ? err.message : err);
    }
  }

  private async processPendingTx(txHash: string): Promise<void> {
    try {
      const tx = await this.provider?.getTransaction(txHash);
      if (!tx || !tx.from || !tx.to) return;

      const redis = getRedis();
      const chain: Chain = 'ethereum';

      // O(1) Redis Set lookup — the hot path
      const [fromIsWhale, toIsWhale] = await Promise.all([
        isWhaleAddress(redis, tx.from, chain),
        isWhaleAddress(redis, tx.to, chain),
      ]);

      if (!fromIsWhale && !toIsWhale) return;

      // Fetch current ETH price for USD conversion
      const ethPriceUsd = await this.getEthPrice();
      if (!ethPriceUsd) return;

      const amountEth = parseFloat(ethers.formatEther(tx.value));
      const amountUsd = amountEth * ethPriceUsd;

      // Check against configured thresholds
      const direction = this.inferDirection(tx.from, tx.to);
      const threshold = this.getThreshold(direction);

      if (amountUsd < threshold) {
        // Log for audit trail but don't alert
        return;
      }

      const whaleTx: WhaleTransaction = {
        txHash: tx.hash,
        chain,
        fromAddress: tx.from.toLowerCase(),
        toAddress: tx.to.toLowerCase(),
        fromAlias: this.walletAliasMap.get(tx.from.toLowerCase()),
        toAlias: this.walletAliasMap.get(tx.to.toLowerCase()),
        token: 'ETH',
        amountRaw: tx.value.toString(),
        amountUsd,
        direction,
        blockNumber: tx.blockNumber ?? 0,
        timestamp: new Date(),
        isPending: true,
      };

      // Persist and publish concurrently
      await Promise.all([
        this.persistTransaction(whaleTx),
        this.publishAlert(whaleTx),
      ]);

      this.emit('whaleTx', whaleTx);

      console.info(
        `[whale-tracker] 🐋 ${direction.toUpperCase()} detected: ` +
        `$${amountUsd.toLocaleString()} ETH — ${txHash}`,
      );
    } catch (err) {
      // Don't let a single tx error crash the stream
      if (err instanceof Error && !err.message.includes('not found')) {
        console.error('[whale-tracker] Error processing tx:', err.message);
      }
    }
  }

  private inferDirection(from: string, to: string): WalletDirection {
    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();

    if (EXCHANGE_ADDRESSES.has(fromLower)) return 'buy';   // exchange → wallet = buy
    if (EXCHANGE_ADDRESSES.has(toLower)) return 'sell';    // wallet → exchange = sell
    return 'transfer';                                      // wallet → wallet = transfer
  }

  private getThreshold(direction: WalletDirection): number {
    switch (direction) {
      case 'buy': return config.WHALE_BUY_THRESHOLD_USD;
      case 'sell': return config.WHALE_SELL_THRESHOLD_USD;
      case 'transfer': return config.WHALE_TRANSFER_THRESHOLD_USD;
    }
  }

  private async getEthPrice(): Promise<number | null> {
    try {
      const redis = getRedis();
      const cached = await redis.get(redisKey.ticker('ETH-USD', 'coingecko'));
      if (cached) {
        const ticker = JSON.parse(cached) as { price: number };
        return ticker.price;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async persistTransaction(tx: WhaleTransaction): Promise<void> {
    await run(
      `INSERT OR IGNORE INTO whale_transactions
         (tx_hash, chain, from_address, to_address, from_alias, to_alias,
          token, amount_raw, amount_usd, direction, block_number, ts)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        tx.txHash, tx.chain, tx.fromAddress, tx.toAddress,
        tx.fromAlias ?? null, tx.toAlias ?? null,
        tx.token, tx.amountRaw, tx.amountUsd, tx.direction,
        tx.blockNumber, tx.timestamp.toISOString(),
      ],
    );
  }

  private async publishAlert(tx: WhaleTransaction): Promise<void> {
    const redis = getRedis();

    // Deduplication: suppress if same tx was published in last 60s
    const dedupKey = redisKey.alertDedup(`whale_${tx.direction}`, tx.txHash);
    const alreadyPublished = await redis.set(dedupKey, '1', 'EX', 60, 'NX');

    if (alreadyPublished === null) {
      console.debug(`[whale-tracker] Suppressed duplicate alert for ${tx.txHash}`);
      return;
    }

    const alertType = tx.direction === 'buy'
      ? 'whale_buy'
      : tx.direction === 'sell'
      ? 'whale_sell'
      : 'whale_transfer';

    const payload = {
      type: alertType,
      severity: tx.amountUsd >= 1_000_000 ? 'critical' : 'high',
      title: `🐋 Whale ${tx.direction.toUpperCase()}: $${Math.round(tx.amountUsd).toLocaleString()}`,
      body: `${tx.fromAlias ?? tx.fromAddress.slice(0, 8)}... → ${tx.toAlias ?? tx.toAddress.slice(0, 8)}...`,
      metadata: tx,
      timestamp: new Date().toISOString(),
    };

    await redis.publish(REDIS_CHANNELS.ALERT_WHALE, JSON.stringify(payload));
  }
}

export const whaleTracker = new WhaleTrackerService();
