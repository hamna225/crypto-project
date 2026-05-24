// ─── SHARED TYPE CONTRACTS ────────────────────────────────────────────────────
// All services import from here. Never duplicate type definitions across layers.
export const REDIS_CHANNELS = {
    PRICE_TICK: 'stream:price:tick',
    WHALE_DETECTED: 'stream:whale:detected',
    SENTIMENT_SCORED: 'stream:sentiment:scored',
    FEAR_GREED_UPDATED: 'stream:fear_greed:updated',
    ALERT_DISPATCH: 'alerts:dispatch',
    ALERT_WHALE: 'alerts:whale',
    ALERT_PRICE: 'alerts:price',
    ALERT_SENTIMENT: 'alerts:sentiment',
};
//# sourceMappingURL=index.js.map