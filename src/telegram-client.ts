import TelegramBot from 'node-telegram-bot-api';
import { Creator, InlineKeyboardMarkup } from './types';
import { config } from './config';
import { XApiClient } from './x-api-client';
import { FarcasterClient } from './farcaster-client';
import { RedisClient } from './redis-client';

export class TelegramClient {
  private bot: TelegramBot;
  private xApiClient: XApiClient;
  private farcasterClient: FarcasterClient;
  private redisClient: RedisClient;

  constructor(redisClient: RedisClient) {
    this.bot = new TelegramBot(config.telegramBotToken, { polling: false });
    this.xApiClient = new XApiClient();
    this.farcasterClient = new FarcasterClient();
    this.redisClient = redisClient;
  }

  startBot(): void {
    this.bot.startPolling();
    this.setupCommandHandlers();
    console.log('Telegram bot started and listening for commands');
  }

  stopBot(): void {
    this.bot.stopPolling();
    console.log('Telegram bot stopped');
  }

  private setupCommandHandlers(): void {
    // Command: /add_alpha_list
    this.bot.onText(/\/add_alpha_list(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const usernames = match?.[1];

      if (!usernames) {
        await this.bot.sendMessage(chatId, 
          'Использование: /add_alpha_list username1 username2 username3\n' +
          'Пример: /add_alpha_list ufo wakeupremember wethemniggas'
        );
        return;
      }

      const usernameList = usernames.split(/\s+/).filter(u => u.trim());
      if (usernameList.length === 0) {
        await this.bot.sendMessage(chatId, 'Необходимо указать хотя бы один username');
        return;
      }

      try {
        const addedCount = await this.redisClient.addToAlphaList(usernameList);
        const totalCount = await this.redisClient.getAlphaListCount();
        
        await this.bot.sendMessage(chatId, 
          `✅ Добавлено ${addedCount} новых пользователей в alpha list\n` +
          `Общее количество: ${totalCount}\n\n` +
          `Добавленные usernames:\n${usernameList.map(u => `• ${u}`).join('\n')}`
        );
      } catch (error) {
        console.error('Error in add_alpha_list command:', error);
        await this.bot.sendMessage(chatId, 'Ошибка при добавлении в alpha list');
      }
    });

    // Command: /alpha_list
    this.bot.onText(/\/alpha_list/, async (msg) => {
      const chatId = msg.chat.id;

      try {
        const alphaList = await this.redisClient.getAlphaList();
        
        if (alphaList.length === 0) {
          await this.bot.sendMessage(chatId, 'Alpha list пуст');
          return;
        }

        const message = `📋 Alpha List (${alphaList.length} пользователей):\n\n` +
          alphaList.map((username, index) => `${index + 1}. ${username}`).join('\n');

        // Split message if too long (Telegram limit)
        if (message.length > 4000) {
          const chunks = this.splitMessage(message, 4000);
          for (const chunk of chunks) {
            await this.bot.sendMessage(chatId, chunk);
          }
        } else {
          await this.bot.sendMessage(chatId, message);
        }
      } catch (error) {
        console.error('Error in alpha_list command:', error);
        await this.bot.sendMessage(chatId, 'Ошибка при получении alpha list');
      }
    });

    // Command: /remove_alpha_user
    this.bot.onText(/\/remove_alpha_user(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const username = match?.[1]?.trim();

      if (!username) {
        await this.bot.sendMessage(chatId, 
          'Использование: /remove_alpha_user username\n' +
          'Пример: /remove_alpha_user ufo'
        );
        return;
      }

      try {
        const removed = await this.redisClient.removeFromAlphaList(username);
        const totalCount = await this.redisClient.getAlphaListCount();
        
        if (removed) {
          await this.bot.sendMessage(chatId, 
            `✅ Пользователь ${username} удален из alpha list\n` +
            `Осталось пользователей: ${totalCount}`
          );
        } else {
          await this.bot.sendMessage(chatId, 
            `❌ Пользователь ${username} не найден в alpha list`
          );
        }
      } catch (error) {
        console.error('Error in remove_alpha_user command:', error);
        await this.bot.sendMessage(chatId, 'Ошибка при удалении из alpha list');
      }
    });
  }

  private splitMessage(message: string, maxLength: number): string[] {
    const chunks: string[] = [];
    const lines = message.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // If single line is too long, split it
        if (line.length > maxLength) {
          const words = line.split(' ');
          for (const word of words) {
            if ((currentChunk + word + ' ').length > maxLength) {
              if (currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
              }
            }
            currentChunk += word + ' ';
          }
        } else {
          currentChunk = line + '\n';
        }
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private escapeMarkdown(text: string): string {
    // Escape special Markdown characters for Telegram
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  private formatUsernameLink(username: string, platform: 'zora' | 'farcaster' | 'twitter'): string {
    const baseUrls = {
      zora: 'https://zora.co',
      farcaster: 'https://warpcast.com',
      twitter: 'https://x.com'
    };
    
    const url = `${baseUrls[platform]}/${username}`;
    // Don't escape username inside markdown links - it will show escaped characters
    return `[@${username}](${url})`;
  }

  private getFollowerIndicator(followerCount: number): string {
    if (followerCount < 50) {
      return '🔴'; // красный круг для менее 50 подписчиков
    } else if (followerCount < 1000) {
      return '🟡'; // желтый круг для 50-999 подписчиков
    } else {
      return '🟢'; // зеленый круг для 1000+ подписчиков
    }
  }

  private async formatCreatorMessage(creator: Creator): Promise<string> {
    const { address, name, createdAt, creatorProfile } = creator;
    const { followedEdges, username, socialAccounts } = creatorProfile;
    const followerIndicator = this.getFollowerIndicator(followedEdges.count);
    
    let message = `NEW CREATOR\n\n`;
    message += `Name: ${this.escapeMarkdown(name)}\n`;
    message += `Address: \`${address}\`\n`;
    message += `Followers: ${followedEdges.count} ${followerIndicator}\n`;
    message += `Created: ${this.escapeMarkdown(new Date(createdAt).toLocaleString('en-US'))}\n`;
    
    if (username) {
      const usernameLink = this.formatUsernameLink(username, 'zora');
      message += `Username: ${usernameLink}\n`;
    }

    // Add Farcaster with followers and clickable link
    if (socialAccounts.farcaster?.displayName || socialAccounts.farcaster?.username) {
      message += `\nFarcaster:\n`;
      if (socialAccounts.farcaster.displayName) {
        message += `  Name: ${this.escapeMarkdown(socialAccounts.farcaster.displayName)}\n`;
      }
      if (socialAccounts.farcaster.username) {
        // Get follower count via Farcaster API
        const farcasterData = await this.getFarcasterData(socialAccounts.farcaster.username);
        const usernameLink = this.formatUsernameLink(socialAccounts.farcaster.username, 'farcaster');
        
        if (farcasterData) {
          message += `  ${usernameLink} (${farcasterData.followers.toLocaleString('en-US')} followers)\n`;
        } else {
          message += `  ${usernameLink}\n`;
        }
      }
    }

    // Add Twitter with followers and clickable link
    if (socialAccounts.twitter?.displayName || socialAccounts.twitter?.username) {
      message += `\nTwitter:\n`;
      if (socialAccounts.twitter.displayName) {
        message += `  Name: ${this.escapeMarkdown(socialAccounts.twitter.displayName)}\n`;
      }
      if (socialAccounts.twitter.username) {
        // Get follower count via X API
        const followersCount = await this.getTwitterFollowers(socialAccounts.twitter.username);
        const usernameLink = this.formatUsernameLink(socialAccounts.twitter.username, 'twitter');
        
        if (followersCount !== null) {
          message += `  ${usernameLink} (${followersCount.toLocaleString('en-US')} followers)\n`;
        } else {
          message += `  ${usernameLink}\n`;
        }
      }
    }

    // Add prefix for high follower count
    if (followedEdges.count >= config.highFollowersThreshold) {
      message = `HIGH VALUE CREATOR\n\n` + message;
    }

    return message;
  }

  private getCreatorKeyboardMarkup(creator: Creator): InlineKeyboardMarkup {
    const address = creator.address;
    
    return {
      inline_keyboard: [
        [
          { 
            text: 'Based Bot', 
            url: `https://t.me/based_eth_bot?start=r_worldfinaltour_b_${address}` 
          }
        ],
        [
            {
                text: 'DexScreener', 
                url: `https://dexscreener.com/base/${address}` 
            }
        ]
      ]
    };
  }

  private async getTwitterFollowers(username: string): Promise<number | null> {
    try {
      return await this.xApiClient.getFollowersCount(username);
    } catch (error) {
      console.error(`Error getting X followers for @${username}:`, error);
      return null;
    }
  }

  private async getFarcasterData(username: string): Promise<{ followers: number; following: number } | null> {
    try {
      return await this.farcasterClient.getUserData(username);
    } catch (error) {
      console.error(`Error getting Farcaster data for @${username}:`, error);
      return null;
    }
  }

  async sendToGeneral(creator: Creator): Promise<void> {
    try {
      const message = await this.formatCreatorMessage(creator);
      const keyboard = this.getCreatorKeyboardMarkup(creator);
      
      await this.bot.sendMessage(config.telegramChatGeneral, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });
      console.log(`Sent to general chat: ${creator.name} (${creator.address})`);
    } catch (error) {
      console.error(`Error sending to general chat for ${creator.address}:`, error);
      // Fallback: try sending without Markdown if it fails
      try {
        const plainMessage = await this.formatCreatorMessage(creator);
        const escapedMessage = plainMessage.replace(/[`*_[\]()]/g, '');
        await this.bot.sendMessage(config.telegramChatGeneral, escapedMessage);
        console.log(`Sent fallback message to general chat: ${creator.name}`);
      } catch (fallbackError) {
        console.error(`Fallback also failed for ${creator.address}:`, fallbackError);
      }
    }
  }

  async sendToHigh(creator: Creator): Promise<void> {
    try {
      const message = await this.formatCreatorMessage(creator);
      const keyboard = this.getCreatorKeyboardMarkup(creator);
      
      await this.bot.sendMessage(config.telegramChatHigh, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });
      console.log(`Sent to HIGH chat: ${creator.name} (${creator.creatorProfile.followedEdges.count} followers)`);
    } catch (error) {
      console.error(`Error sending to HIGH chat for ${creator.address}:`, error);
      // Fallback: try sending without Markdown if it fails
      try {
        const plainMessage = await this.formatCreatorMessage(creator);
        const escapedMessage = plainMessage.replace(/[`*_[\]()]/g, '');
        await this.bot.sendMessage(config.telegramChatHigh, escapedMessage);
        console.log(`Sent fallback message to HIGH chat: ${creator.name}`);
      } catch (fallbackError) {
        console.error(`Fallback also failed for ${creator.address}:`, fallbackError);
      }
    }
  }

  async sendStatusMessage(text: string): Promise<void> {
    try {
      const escapedText = this.escapeMarkdown(text);
      await this.bot.sendMessage(config.telegramChatGeneral, escapedText);
    } catch (error) {
      console.error('Error sending status message:', error);
      // Fallback: send plain text without escaping
      try {
        await this.bot.sendMessage(config.telegramChatGeneral, text);
      } catch (fallbackError) {
        console.error('Status message fallback failed:', fallbackError);
      }
    }
  }

  // Methods for cache statistics
  getXApiCacheSize(): number {
    return this.xApiClient.getCacheSize();
  }

  getFarcasterCacheSize(): number {
    return this.farcasterClient.getCacheSize();
  }

  // Methods for cache cleanup
  clearXApiCache(): void {
    this.xApiClient.clearCache();
  }

  clearFarcasterCache(): void {
    this.farcasterClient.clearCache();
  }

  clearAllSocialCaches(): void {
    this.clearXApiCache();
    this.clearFarcasterCache();
  }
} 