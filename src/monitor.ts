import { ZoraClient } from './zora-client';
import { RedisClient } from './redis-client';
import { TelegramClient } from './telegram-client';
import { XApiClient } from './x-api-client';
import { FarcasterClient } from './farcaster-client';
import { Creator } from './types';
import { config } from './config';

export class ZoraMonitor {
  private zoraClient: ZoraClient;
  private redisClient: RedisClient;
  private telegramClient: TelegramClient;
  private xApiClient: XApiClient;
  private farcasterClient: FarcasterClient;
  private isRunning: boolean = false;

  constructor() {
    this.zoraClient = new ZoraClient();
    this.redisClient = new RedisClient();
    this.telegramClient = new TelegramClient(this.redisClient);
    this.xApiClient = new XApiClient();
    this.farcasterClient = new FarcasterClient();
  }

  async start(): Promise<void> {
    console.log('Starting Zora Trenches Monitor...');
    
    try {
      await this.redisClient.connect();
      console.log('Redis connected');

      const processedCount = await this.redisClient.getProcessedAddressesCount();
      console.log(`Processed addresses in cache: ${processedCount}`);

      // Start telegram bot
      this.telegramClient.startBot();

      await this.telegramClient.sendStatusMessage(
        `Zora Trenches started!`
      );

      this.isRunning = true;
      this.startPolling();

    } catch (error) {
      console.error('Startup error:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    console.log('Stopping monitoring...');
    this.isRunning = false;
    
    // Stop telegram bot
    this.telegramClient.stopBot();
    
    await this.redisClient.disconnect();
    
    const xApiCacheSize = this.telegramClient.getXApiCacheSize();
    const farcasterCacheSize = this.telegramClient.getFarcasterCacheSize();
    const directXCacheSize = this.xApiClient.getCacheSize();
    const directFarcasterCacheSize = this.farcasterClient.getCacheSize();
    
    await this.telegramClient.sendStatusMessage(
      `Zora Trenches Monitor stopped\n` +
      `X API cache (telegram): ${xApiCacheSize} entries\n` +
      `X API cache (direct): ${directXCacheSize} entries\n` +
      `Farcaster cache (telegram): ${farcasterCacheSize} entries\n` +
      `Farcaster cache (direct): ${directFarcasterCacheSize} entries`
    );
  }

  private startPolling(): void {
    const poll = async () => {
      if (!this.isRunning) return;

      try {
        await this.pollNewCreators();
      } catch (error) {
        console.error('Polling error:', error);
      }

      if (this.isRunning) {
        setTimeout(poll, config.pollIntervalSeconds * 1000);
      }
    };

    poll();
  }

  private async pollNewCreators(): Promise<void> {
    try {
      console.log(`Polling new creators... (${new Date().toLocaleTimeString('en-US')})`);
      
      const response = await this.zoraClient.getNewCreators();
      const creators = response.data.exploreList.edges.map(edge => edge.node);

      console.log(`Received ${creators.length} creators`);

      let newCreatorsCount = 0;
      let highValueCount = 0;
      let twitterProfilesProcessed = 0;
      let farcasterProfilesProcessed = 0;

      for (const creator of creators) {
        const isProcessed = await this.redisClient.isAddressProcessed(creator.address);
        
        if (!isProcessed) {
          newCreatorsCount++;
          
          // Check if Twitter account is in blacklist
          const twitterUsername = creator.creatorProfile.socialAccounts.twitter?.username;
          if (twitterUsername) {
            const isBlacklisted = await this.redisClient.isInTwitterBlacklist(twitterUsername);
            if (isBlacklisted) {
              console.log(`Skipping creator ${creator.name} - Twitter @${twitterUsername} is blacklisted`);
              await this.redisClient.markAddressAsProcessed(creator.address);
              continue;
            }
          }
          
          // Count profiles with social networks for statistics
          if (creator.creatorProfile.socialAccounts.twitter?.username) {
            twitterProfilesProcessed++;
          }
          if (creator.creatorProfile.socialAccounts.farcaster?.username) {
            farcasterProfilesProcessed++;
          }
          
          // Send to general chat
          await this.telegramClient.sendToGeneral(creator);
          
          // Check if username is in alpha list and send to HIGH chat
          const alphaUserCheck = await this.checkAlphaUser(creator);
          
          // Check if need to send to HIGH chat
          const highValueCheck = await this.checkHighValueCreator(creator);
          if (highValueCheck.isHigh || alphaUserCheck.isAlpha) {
            highValueCount++;
            const reason = alphaUserCheck.isAlpha ? 'ALPHA USER' : highValueCheck.reason;
            await this.telegramClient.sendToHigh(creator, reason, alphaUserCheck.description);
            console.log(`HIGH VALUE: ${creator.name} - ${reason}`);
          }
          
          // Mark as processed
          await this.redisClient.markAddressAsProcessed(creator.address);
          
          const logReason = alphaUserCheck.isAlpha ? 'ALPHA USER' : highValueCheck.reason;
          console.log(`Processed new creator: ${creator.name} (${logReason})`);
          
          // Small delay between sends for API
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (newCreatorsCount > 0) {
        console.log(`New creators processed: ${newCreatorsCount}`);
        if (highValueCount > 0) {
          console.log(`HIGH value creators: ${highValueCount}`);
        }
        if (twitterProfilesProcessed > 0) {
          console.log(`Twitter profiles processed: ${twitterProfilesProcessed}`);
        }
        if (farcasterProfilesProcessed > 0) {
          console.log(`Farcaster profiles processed: ${farcasterProfilesProcessed}`);
        }
        console.log(`X API cache (telegram): ${this.telegramClient.getXApiCacheSize()} entries`);
        console.log(`X API cache (direct): ${this.xApiClient.getCacheSize()} entries`);
        console.log(`Farcaster cache (telegram): ${this.telegramClient.getFarcasterCacheSize()} entries`);
        console.log(`Farcaster cache (direct): ${this.farcasterClient.getCacheSize()} entries`);
      } else {
        console.log('No new creators found');
      }

    } catch (error) {
      console.error('Polling error:', error);
      
      // Send error notification
      try {
        await this.telegramClient.sendStatusMessage(
          `Monitoring error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      } catch (telegramError) {
        console.error('Failed to send error notification:', telegramError);
      }
    }
  }

  private async checkHighValueCreator(creator: Creator): Promise<{ isHigh: boolean; reason: string; maxFollowers: number }> {
    const zoraFollowers = creator.creatorProfile.followedEdges.count;
    let maxFollowers = zoraFollowers;
    let platform = 'Zora';

    // Check for high value tokens first (highest priority)
    const maxTokenMarketCap = this.getMaxTokenMarketCap(creator);
    if (maxTokenMarketCap >= 500000) {
      return { 
        isHigh: true, 
        reason: `HIGH TOP TOKEN: $${maxTokenMarketCap.toLocaleString('en-US')}`, 
        maxFollowers: zoraFollowers 
      };
    }

    // Check Zora followers
    if (zoraFollowers >= config.highFollowersThreshold) {
      return { 
        isHigh: true, 
        reason: `Zora: ${zoraFollowers.toLocaleString('en-US')} followers`, 
        maxFollowers: zoraFollowers 
      };
    }

    // Check X (Twitter) followers
    if (creator.creatorProfile.socialAccounts.twitter?.username) {
      try {
        const xFollowers = await this.xApiClient.getFollowersCount(creator.creatorProfile.socialAccounts.twitter.username);
        if (xFollowers !== null) {
          if (xFollowers > maxFollowers) {
            maxFollowers = xFollowers;
            platform = 'X';
          }
          if (xFollowers >= config.highFollowersThreshold) {
            return { 
              isHigh: true, 
              reason: `X: ${xFollowers.toLocaleString('en-US')} followers`, 
              maxFollowers: xFollowers 
            };
          }
        }
      } catch (error) {
        console.warn(`Error getting X data for @${creator.creatorProfile.socialAccounts.twitter.username}:`, error);
      }
    }

    // Check Farcaster followers
    if (creator.creatorProfile.socialAccounts.farcaster?.username) {
      try {
        const farcasterFollowers = await this.farcasterClient.getFollowersCount(creator.creatorProfile.socialAccounts.farcaster.username);
        if (farcasterFollowers !== null) {
          if (farcasterFollowers > maxFollowers) {
            maxFollowers = farcasterFollowers;
            platform = 'Farcaster';
          }
          if (farcasterFollowers >= config.highFollowersThreshold) {
            return { 
              isHigh: true, 
              reason: `Farcaster: ${farcasterFollowers.toLocaleString('en-US')} followers`, 
              maxFollowers: farcasterFollowers 
            };
          }
        }
      } catch (error) {
        console.warn(`Error getting Farcaster data for @${creator.creatorProfile.socialAccounts.farcaster.username}:`, error);
      }
    }

    return { 
      isHigh: false, 
      reason: `Max followers: ${maxFollowers.toLocaleString('en-US')} on ${platform}`, 
      maxFollowers 
    };
  }

  private getMaxTokenMarketCap(creator: Creator): number {
    if (!creator.creatorProfile.createdCoins.edges.length) {
      return 0;
    }

    let maxMarketCap = 0;

    for (const edge of creator.creatorProfile.createdCoins.edges) {
      const token = edge.node;
      const marketCap = parseFloat(token.marketCap) || 0;
      
      if (marketCap > maxMarketCap) {
        maxMarketCap = marketCap;
      }
    }

    return maxMarketCap;
  }

  private async checkAlphaUser(creator: Creator): Promise<{isAlpha: boolean, description?: string}> {
    const username = creator.creatorProfile.username;
    if (!username) {
      return {isAlpha: false};
    }

    try {
      const isInList = await this.redisClient.isInAlphaList(username);
      if (isInList) {
        const description = await this.redisClient.getAlphaUserDescription(username);
        return {isAlpha: true, description: description || undefined};
      }
      return {isAlpha: false};
    } catch (error) {
      console.error(`Error checking alpha list for ${username}:`, error);
      return {isAlpha: false};
    }
  }

  // Method for cache cleanup (useful for debugging)
  async clearCache(): Promise<void> {
    await this.redisClient.clearProcessedAddresses();
    this.telegramClient.clearAllSocialCaches();
    this.xApiClient.clearCache();
    this.farcasterClient.clearCache();
    console.log('All caches cleared');
  }
} 