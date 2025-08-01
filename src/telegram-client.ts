import TelegramBot from 'node-telegram-bot-api';
import { Creator, InlineKeyboardMarkup, InlineKeyboardButton, CreatedCoin } from './types';
import { config } from './config';
import { XApiClient } from './x-api-client';
import { FarcasterClient } from './farcaster-client';
import { RedisClient } from './redis-client';
import * as path from 'path';
import * as fs from 'fs';

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

    // Command: /add_alpha_user - adds single user with optional description
    this.bot.onText(/\/add_alpha_user(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const input = match?.[1];

      if (!input) {
        await this.bot.sendMessage(chatId, 
          'Использование: /add_alpha_user username ["описание в кавычках"]\n' +
          'Примеры:\n' +
          '• /add_alpha_user ufo\n' +
          '• /add_alpha_user ufo "Создатель популярных NFT коллекций"\n' +
          '• /add_alpha_user wakeupremember "Эксперт в области DeFi и криптовалют"'
        );
        return;
      }

      // Parse username and description with proper quote handling
      let username: string;
      let description: string | undefined;

      // Check if input contains quoted description
      const quoteMatch = input.match(/^(\S+)\s+"([^"]*)"$/);
      if (quoteMatch) {
        // Format: username "description"
        username = quoteMatch[1];
        description = quoteMatch[2].trim() || undefined;
      } else {
        // Format: username only (no quotes)
        username = input.trim();
        description = undefined;
      }

      if (!username.trim()) {
        await this.bot.sendMessage(chatId, 'Необходимо указать username');
        return;
      }

      try {
        const success = await this.redisClient.addToAlphaListWithDescription(username, description);
        const totalCount = await this.redisClient.getAlphaListCount();
        
        if (success) {
          let message = `✅ Пользователь ${username} добавлен в alpha list`;
          if (description) {
            message += `\nОписание: ${description}`;
          }
          message += `\nОбщее количество пользователей: ${totalCount}`;
          
          await this.bot.sendMessage(chatId, message);
        } else {
          await this.bot.sendMessage(chatId, 'Ошибка при добавлении пользователя в alpha list');
        }
      } catch (error) {
        console.error('Error in add_alpha_user command:', error);
        await this.bot.sendMessage(chatId, 'Ошибка при добавлении в alpha list');
      }
    });

    // Command: /add_alpha_user_batch - adds multiple users with descriptions
    this.bot.onText(/\/add_alpha_user_batch(?:\s+([\s\S]+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const input = match?.[1];

      if (!input) {
        await this.bot.sendMessage(chatId, 
          'Использование: /add_alpha_user_batch\n' +
          'Формат: username (описание)\n\n' +
          'Пример:\n' +
          '0x0298f4332e3857631385b39766325058a93e249f (165к фолловеров фаркастер, фаундер какого то теха sablier, можно на копейку)\n' +
          '0x075b108fc0a6426f9dec9a5c18e87eb577d1346a (horsefacts админ/дев фаркастера, можно на копейку)\n' +
          '0x081c7f89dffc2f618a0f4347c06fdf70f52e6510 (профиль kaloh ещё один, можно на копейку)'
        );
        return;
      }

      try {
        // Parse each line: username (description)
        const lines = input.trim().split('\n').filter(line => line.trim());
        const users: { username: string; description: string }[] = [];
        const errors: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Match pattern: username (description)
          const match = line.match(/^([^\s(]+)\s*\(([^)]+)\)$/);
          
          if (match) {
            const username = match[1].trim();
            const description = match[2].trim();
            
            if (username && description) {
              users.push({ username, description });
            } else {
              errors.push(`Строка ${i + 1}: пустой username или описание`);
            }
          } else {
            errors.push(`Строка ${i + 1}: неверный формат (ожидается: username (описание))`);
          }
        }

        if (users.length === 0) {
          await this.bot.sendMessage(chatId, 
            'Не найдено корректных записей для добавления\n\n' +
            (errors.length > 0 ? `Ошибки:\n${errors.join('\n')}` : '')
          );
          return;
        }

        // Add users to alpha list
        let addedCount = 0;
        const addErrors: string[] = [];

        for (const user of users) {
          try {
            const success = await this.redisClient.addToAlphaListWithDescription(user.username, user.description);
            if (success) {
              addedCount++;
            } else {
              addErrors.push(`${user.username}: ошибка при добавлении`);
            }
          } catch (error) {
            addErrors.push(`${user.username}: ${error}`);
          }
        }

        const totalCount = await this.redisClient.getAlphaListCount();

        // Prepare response message
        let message = `✅ Batch добавление завершено\n\n`;
        message += `Добавлено: ${addedCount} из ${users.length} пользователей\n`;
        message += `Общее количество в alpha list: ${totalCount}\n\n`;

        if (addedCount > 0) {
          message += `Успешно добавлены:\n`;
          users.slice(0, addedCount).forEach((user, index) => {
            message += `${index + 1}. ${user.username}\n   📝 ${user.description}\n\n`;
          });
        }

        if (errors.length > 0) {
          message += `\nОшибки форматирования:\n${errors.join('\n')}\n\n`;
        }

        if (addErrors.length > 0) {
          message += `\nОшибки добавления:\n${addErrors.join('\n')}`;
        }

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
        console.error('Error in add_alpha_user_batch command:', error);
        await this.bot.sendMessage(chatId, 'Ошибка при batch добавлении в alpha list');
      }
    });

    // Command: /alpha_list
    this.bot.onText(/\/alpha_list/, async (msg) => {
      const chatId = msg.chat.id;

      try {
        const alphaListWithDescriptions = await this.redisClient.getAlphaListWithDescriptions();
        
        if (alphaListWithDescriptions.length === 0) {
          await this.bot.sendMessage(chatId, 'Alpha list пуст');
          return;
        }

        const message = `📋 Alpha List (${alphaListWithDescriptions.length} пользователей):\n\n` +
          alphaListWithDescriptions.map((item, index) => {
            let userLine = `${index + 1}. ${item.username}`;
            if (item.description) {
              userLine += `\n   📝 ${item.description}`;
            }
            return userLine;
          }).join('\n\n');

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

    // Command: /add_twitter_blacklist
    this.bot.onText(/\/add_twitter_blacklist(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const usernames = match?.[1];

      if (!usernames) {
        await this.bot.sendMessage(chatId, 
          'Использование: /add_twitter_blacklist username1 username2 username3\n' +
          'Пример: /add_twitter_blacklist baduser1 spammer2 scammer3'
        );
        return;
      }

      const usernameList = usernames.split(/\s+/).filter(u => u.trim());
      if (usernameList.length === 0) {
        await this.bot.sendMessage(chatId, 'Необходимо указать хотя бы один Twitter username');
        return;
      }

      try {
        const addedCount = await this.redisClient.addToTwitterBlacklist(usernameList);
        const totalCount = await this.redisClient.getTwitterBlacklistCount();
        
        await this.bot.sendMessage(chatId, 
          `🚫 Добавлено ${addedCount} новых Twitter аккаунтов в blacklist\n` +
          `Общее количество: ${totalCount}\n\n` +
          `Добавленные Twitter usernames:\n${usernameList.map(u => `• @${u}`).join('\n')}`
        );
      } catch (error) {
        console.error('Error in add_twitter_blacklist command:', error);
        await this.bot.sendMessage(chatId, 'Ошибка при добавлении в Twitter blacklist');
      }
    });

    // Command: /twitter_blacklist
    this.bot.onText(/\/twitter_blacklist/, async (msg) => {
      const chatId = msg.chat.id;

      try {
        const blacklist = await this.redisClient.getTwitterBlacklist();
        
        if (blacklist.length === 0) {
          await this.bot.sendMessage(chatId, 'Twitter blacklist пуст');
          return;
        }

        const message = `🚫 Twitter Blacklist (${blacklist.length} аккаунтов):\n\n` +
          blacklist.map((username, index) => `${index + 1}. @${username}`).join('\n');

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
        console.error('Error in twitter_blacklist command:', error);
        await this.bot.sendMessage(chatId, 'Ошибка при получении Twitter blacklist');
      }
    });

    // Command: /remove_twitter_blacklist
    this.bot.onText(/\/remove_twitter_blacklist(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const username = match?.[1]?.trim();

      if (!username) {
        await this.bot.sendMessage(chatId, 
          'Использование: /remove_twitter_blacklist username\n' +
          'Пример: /remove_twitter_blacklist baduser1'
        );
        return;
      }

      try {
        const removed = await this.redisClient.removeFromTwitterBlacklist(username);
        const totalCount = await this.redisClient.getTwitterBlacklistCount();
        
        if (removed) {
          await this.bot.sendMessage(chatId, 
            `✅ Twitter аккаунт @${username} удален из blacklist\n` +
            `Осталось аккаунтов: ${totalCount}`
          );
        } else {
          await this.bot.sendMessage(chatId, 
            `❌ Twitter аккаунт @${username} не найден в blacklist`
          );
        }
      } catch (error) {
        console.error('Error in remove_twitter_blacklist command:', error);
        await this.bot.sendMessage(chatId, 'Ошибка при удалении из Twitter blacklist');
      }
    });

    // Callback handler for blacklist Twitter button
    this.bot.on('callback_query', async (callbackQuery) => {
      const chatId = callbackQuery.message?.chat.id;
      const messageId = callbackQuery.message?.message_id;
      const data = callbackQuery.data;

      if (!chatId || !messageId || !data) return;

      if (data.startsWith('blacklist_twitter:')) {
        const twitterUsername = data.split(':')[1];
        
        try {
          // Check if already in blacklist
          const isAlreadyBlacklisted = await this.redisClient.isInTwitterBlacklist(twitterUsername);
          
          if (isAlreadyBlacklisted) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
              text: `@${twitterUsername} уже в blacklist`,
              show_alert: true
            });
            return;
          }

          // Add to blacklist
          await this.redisClient.addToTwitterBlacklist([twitterUsername]);
          const totalCount = await this.redisClient.getTwitterBlacklistCount();

          // Send confirmation message
          await this.bot.sendMessage(chatId, 
            `🚫 Twitter аккаунт @${twitterUsername} добавлен в blacklist\n` +
            `Всего в blacklist: ${totalCount} аккаунтов`
          );

          // Answer callback query
          await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: `@${twitterUsername} добавлен в blacklist`,
            show_alert: false
          });

          console.log(`Twitter @${twitterUsername} added to blacklist via button`);
        } catch (error) {
          console.error('Error in blacklist_twitter callback:', error);
          await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Ошибка при добавлении в blacklist',
            show_alert: true
          });
        }
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

  private getMaxMarketCapToken(creator: Creator): { token: CreatedCoin; marketCap: number } | null {
    if (!creator.creatorProfile.createdCoins.edges.length) {
      return null;
    }

    let maxToken: CreatedCoin | null = null;
    let maxMarketCap = 0;

    for (const edge of creator.creatorProfile.createdCoins.edges) {
      const token = edge.node;
      const marketCap = parseFloat(token.marketCap) || 0;
      
      if (marketCap > maxMarketCap) {
        maxMarketCap = marketCap;
        maxToken = token;
      }
    }

    return maxToken ? { token: maxToken, marketCap: maxMarketCap } : null;
  }

  private async formatCreatorMessage(creator: Creator, reason?: string, alphaDescription?: string): Promise<string> {
    const { address, name, createdAt, creatorProfile } = creator;
    const { followedEdges, username, socialAccounts, vcFollowingStatus, createdCoins, followersInVcFollowing } = creatorProfile;
    const followerIndicator = this.getFollowerIndicator(followedEdges.count);
    
    let message = `NEW CREATOR\n\n`;
    
    // Add reason at the beginning if provided
    if (reason) {
      message = `${reason}\n`;
      
      // Add alpha description if this is an ALPHA USER and description exists
      if (reason === 'ALPHA USER' && alphaDescription) {
        message += `📝 ${alphaDescription}\n`;
      }
      
      message += `\nNEW CREATOR\n\n`;
    }
    
    message += `Name: ${this.escapeMarkdown(name)}\n`;
    message += `Address: \`${address}\`\n`;
    message += `Followers: ${followedEdges.count} ${followerIndicator}\n`;
    
    // Add vcFollowingStatus and VC followers count if FOLLOWING
    if (vcFollowingStatus && vcFollowingStatus === 'FOLLOWING') {
      message += `VC Following: ${this.escapeMarkdown(vcFollowingStatus)} (${followersInVcFollowing.count} VC followers)\n`;
    } else if (vcFollowingStatus && vcFollowingStatus !== 'UNKNOWN') {
      message += `VC Following: ${this.escapeMarkdown(vcFollowingStatus)}\n`;
    }
    
    message += `Created: ${this.escapeMarkdown(new Date(createdAt).toLocaleString('en-US'))}\n`;
    
    if (username) {
      const usernameLink = this.formatUsernameLink(username, 'zora');
      message += `Username: ${usernameLink}\n`;
    }

    // Add best token info if exists
    const maxTokenInfo = this.getMaxMarketCapToken(creator);
    if (maxTokenInfo && maxTokenInfo.marketCap > 0) {
      message += `\nBest Token:\n`;
      message += `  Name: ${this.escapeMarkdown(maxTokenInfo.token.name)}\n`;
      message += `  Market Cap: $${maxTokenInfo.marketCap.toLocaleString('en-US')}\n`;
      message += `  Address: \`${maxTokenInfo.token.address}\`\n`;
    } else if (createdCoins.edges.length > 0) {
      message += `\nCreated Tokens: ${createdCoins.edges.length}\n`;
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

    // Add prefix for high follower count (only if no reason provided)
    if (!reason && followedEdges.count >= config.highFollowersThreshold) {
      message = `HIGH VALUE CREATOR\n\n` + message;
    }

    return message;
  }

  private getCreatorKeyboardMarkup(creator: Creator): InlineKeyboardMarkup {
    const address = creator.address;
    const twitterUsername = creator.creatorProfile.socialAccounts.twitter?.username;
    
    const keyboard: InlineKeyboardButton[][] = [
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
    ];

    // Add blacklist button if Twitter is connected
    if (twitterUsername) {
      keyboard.push([
        {
          text: '🚫 Blacklist Twitter',
          callback_data: `blacklist_twitter:${twitterUsername}`
        }
      ]);
    }
    
    return {
      inline_keyboard: keyboard
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

  async sendToHigh(creator: Creator, reason: string, alphaDescription?: string): Promise<void> {
    try {
      const message = await this.formatCreatorMessage(creator, reason, alphaDescription);
      const keyboard = this.getCreatorKeyboardMarkup(creator);
      
      // Check if this is an ALPHA USER and image exists
      if (reason === 'ALPHA USER') {
        const imagePath = path.join(process.cwd(), 'public', 'alphaimage.png');
        
        if (fs.existsSync(imagePath)) {
          try {
            await this.bot.sendPhoto(config.telegramChatHigh, imagePath, {
              caption: message,
              parse_mode: 'Markdown',
              reply_markup: keyboard
            });
            console.log(`Sent to HIGH chat with image: ${creator.name} (ALPHA USER)`);
            return;
          } catch (photoError) {
            console.error(`Error sending photo for ALPHA USER ${creator.address}:`, photoError);
            // Fall through to send text message
          }
        } else {
          console.warn(`Alpha image not found at ${imagePath}`);
        }
      }
      
      // Send regular text message (either not ALPHA USER or image failed)
      await this.bot.sendMessage(config.telegramChatHigh, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });
      console.log(`Sent to HIGH chat: ${creator.name} (${reason})`);
      
    } catch (error) {
      console.error(`Error sending to HIGH chat for ${creator.address}:`, error);
      // Fallback: try sending without Markdown if it fails
      try {
        const plainMessage = await this.formatCreatorMessage(creator, reason, alphaDescription);
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