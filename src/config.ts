import dotenv from 'dotenv';
import { Config } from './types';

dotenv.config();

export const config: Config = {
  zoraEndpointUrl: process.env.ZORA_ENDPOINT_URL || 'https://api.zora.co/universal/graphql',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatGeneral: process.env.TELEGRAM_CHAT_GENERAL || '',
  telegramChatHigh: process.env.TELEGRAM_CHAT_HIGH || '',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  proxyHost: process.env.PROXY_HOST || '',
  proxyPort: parseInt(process.env.PROXY_PORT || '8681'),
  proxyUsername: process.env.PROXY_USERNAME || '',
  proxyPassword: process.env.PROXY_PASSWORD || '',
  pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS || '5'),
  highFollowersThreshold: parseInt(process.env.HIGH_FOLLOWERS_THRESHOLD || '10000'),
  xApiKey: process.env.X_API_KEY || '',
  zoraApiKey: process.env.ZORA_API_KEY || '',
};

// Required fields validation
const requiredFields = [
  'telegramBotToken',
  'telegramChatGeneral',
  'telegramChatHigh',
  'proxyHost',
  'proxyUsername',
  'proxyPassword',
  'xApiKey',
  'zoraApiKey'
];

for (const field of requiredFields) {
  if (!config[field as keyof Config]) {
    throw new Error(`Required environment variable ${field.toUpperCase()} is not set`);
  }
} 