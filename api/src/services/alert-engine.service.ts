import TelegramBot from 'node-telegram-bot-api';
import { getRedisSubscriber, getRedis } from '../db/redis.js';
import { REDIS_CHANNELS } from '../../../shared/types/index.js';
import type { AlertType, AlertSeverity, AlertChannel } from '../../../shared/types/index.js';
import { config } from '../config.js';
import { query, getSetting } from '../db/client.js';
import { v4 as uuidv4 } from 'uuid';

// ─── Alert Engine ─────────────────────────────────────────────────────────────
// Subscribes to Redis Pub/Sub alert channels and fans out to all configured
// delivery channels simultaneously.

interface AlertPayload {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: '🚨',
  high: '⚠️',
  medium: '📊',
  low: 'ℹ️',
};

export class AlertEngineService {
  private telegramBot: TelegramBot | null = null;
  private readonly channels: AlertChannel[] = [];

  constructor() {
    // initChannels() is now called via start() to support async DB reads
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const subscriber = getRedisSubscriber();

    // Initialize channels (async DB read for Telegram keys)
    await this.initChannels();

    // Subscribe to all alert channels
    const alertChannels = [
      REDIS_CHANNELS.ALERT_WHALE,
      REDIS_CHANNELS.ALERT_PRICE,
      REDIS_CHANNELS.ALERT_SENTIMENT,
      REDIS_CHANNELS.ALERT_DISPATCH,
    ];

    for (const channel of alertChannels) {
      await subscriber.subscribe(channel);
    }

    subscriber.on('message', (channel: string, message: string) => {
      void this.handleAlertMessage(channel, message);
    });

    console.info(`[alert-engine] Subscribed to ${alertChannels.length} alert channels`);
    console.info(`[alert-engine] Active delivery channels: ${this.channels.join(', ') || 'none'}`);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  public async reloadChannels(): Promise<void> {
    if (this.telegramBot) {
      try {
        this.telegramBot.stopPolling();
      } catch (err) {}
      this.telegramBot = null;
    }
    this.channels.length = 0;
    await this.initChannels();
  }

  private async initChannels(): Promise<void> {
    const telegramToken = await getSetting('TELEGRAM_BOT_TOKEN') || config.TELEGRAM_BOT_TOKEN;
    const telegramChat = await getSetting('TELEGRAM_CHAT_ID') || config.TELEGRAM_CHAT_ID;

    if (telegramToken && telegramChat) {
      try {
        this.telegramBot = new TelegramBot(telegramToken, { polling: false });
        this.channels.push('telegram');
        console.info('[alert-engine] Telegram channel initialized dynamically');
      } catch (err) {
        console.error('[alert-engine] Failed to init Telegram bot:', err);
      }
    }

    if (config.SENDGRID_API_KEY) {
      this.channels.push('email');
    }

    if (config.TWILIO_ACCOUNT_SID) {
      this.channels.push('sms');
    }

    if (config.ALERT_WEBHOOK_URL) {
      this.channels.push('webhook');
    }
  }

  private async handleAlertMessage(channel: string, message: string): Promise<void> {
    let payload: AlertPayload;

    try {
      payload = JSON.parse(message) as AlertPayload;
    } catch {
      console.error('[alert-engine] Failed to parse alert payload:', message.slice(0, 200));
      return;
    }

    const alertId = uuidv4();

    // Persist to DB for audit log
    await this.persistAlert(alertId, payload);

    // Fan out to all channels concurrently
    const deliveryResults = await Promise.allSettled(
      this.channels.map((ch) => this.deliver(ch, payload)),
    );

    const failedChannels = deliveryResults
      .map((r, i) => (r.status === 'rejected' ? this.channels[i] : null))
      .filter(Boolean);

    // Update status in DB
    const status = failedChannels.length === 0 ? 'delivered' : 'failed';
    await this.updateAlertStatus(alertId, status);

    if (failedChannels.length > 0) {
      console.error(`[alert-engine] Delivery failed on channels: ${failedChannels.join(', ')}`);
    } else {
      console.info(`[alert-engine] Alert delivered: ${payload.title}`);
    }
  }

  private async deliver(channel: AlertChannel, payload: AlertPayload): Promise<void> {
    switch (channel) {
      case 'telegram': return this.deliverTelegram(payload);
      case 'webhook': return this.deliverWebhook(payload);
      case 'email': return this.deliverEmail(payload);
      case 'sms': return this.deliverSms(payload);
      default:
        console.warn(`[alert-engine] Unknown channel: ${String(channel)}`);
    }
  }

  private async deliverTelegram(payload: AlertPayload): Promise<void> {
    if (!this.telegramBot || !config.TELEGRAM_CHAT_ID) {
      throw new Error('Telegram not configured');
    }

    const emoji = SEVERITY_EMOJI[payload.severity];
    const text = [
      `${emoji} *${this.escapeMd(payload.title)}*`,
      ``,
      `${this.escapeMd(payload.body)}`,
      ``,
      `_${new Date(payload.timestamp).toUTCString()}_`,
    ].join('\n');

    await this.telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, text, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
  }

  private async deliverWebhook(payload: AlertPayload): Promise<void> {
    if (!config.ALERT_WEBHOOK_URL) throw new Error('Webhook URL not configured');

    const response = await fetch(config.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }
  }

  private async deliverEmail(payload: AlertPayload): Promise<void> {
    if (!config.SENDGRID_API_KEY) {
      throw new Error('SendGrid API key not configured');
    }

    const sgMail = await import('@sendgrid/mail').then((m) => m.default);
    sgMail.setApiKey(config.SENDGRID_API_KEY);

    const emoji = SEVERITY_EMOJI[payload.severity];
    const htmlContent = `
      <h2>${emoji} ${payload.title}</h2>
      <p>${payload.body}</p>
      <hr />
      <p><small><em>${new Date(payload.timestamp).toUTCString()}</em></small></p>
      <p><small>Alert Type: ${payload.type} | Severity: ${payload.severity}</small></p>
    `;

    const textContent = [
      `${emoji} ${payload.title}`,
      '',
      payload.body,
      '',
      `${new Date(payload.timestamp).toUTCString()}`,
      `Alert Type: ${payload.type} | Severity: ${payload.severity}`,
    ].join('\n');

    const msg = {
      to: config.ALERT_EMAIL_TO || 'alerts@cryptointelligence.local',
      from: config.ALERT_EMAIL_FROM || 'noreply@cryptointelligence.local',
      subject: `[${payload.severity.toUpperCase()}] ${payload.title}`,
      text: textContent,
      html: htmlContent,
    };

    await sgMail.send(msg);
  }

  private async deliverSms(payload: AlertPayload): Promise<void> {
    if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials not configured');
    }

    const twilio = await import('twilio').then((m) => m.default);
    const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

    const emoji = SEVERITY_EMOJI[payload.severity];
    const smsBody = [
      `${emoji} ${payload.title}`,
      payload.body.slice(0, 100), // SMS length limit
    ].join('\n');

    await client.messages.create({
      body: smsBody,
      from: config.TWILIO_PHONE_FROM || '+1234567890',
      to: config.TWILIO_PHONE_TO || '+0987654321',
    });
  }

  private escapeMd(text: string): string {
    // MarkdownV2 requires escaping special chars
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  private async persistAlert(id: string, payload: AlertPayload): Promise<void> {
    await query(
      `INSERT INTO alerts (id, type, severity, title, body, metadata, channels, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, payload.type, payload.severity, payload.title, payload.body,
       JSON.stringify(payload.metadata), JSON.stringify(this.channels)],
    );
  }

  private async updateAlertStatus(id: string, status: string): Promise<void> {
    await query(
      `UPDATE alerts
       SET status = ?, delivered_at = CASE WHEN ? = 'delivered' THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE id = ?`,
      [status, status, id],
    );
  }
}

export const alertEngine = new AlertEngineService();
