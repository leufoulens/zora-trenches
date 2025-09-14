import { ZoraClient } from './zora-client';
import { RedisClient } from './redis-client';
import { FileStorageClient } from './file-storage-client';
import { TelegramClient } from './telegram-client';
import { Creator } from './types';
import { config } from './config';

export class ZoraMonitor {
  private zoraClient: ZoraClient;
  private redisClient: RedisClient;
  private fileStorageClient: FileStorageClient;
  private telegramClient: TelegramClient;
  private isRunning: boolean = false;

  constructor() {
    this.zoraClient = new ZoraClient();
    this.redisClient = new RedisClient();
    this.fileStorageClient = new FileStorageClient();
    this.telegramClient = new TelegramClient(this.redisClient, this.fileStorageClient);
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
    
    await this.telegramClient.sendStatusMessage(
      `Zora Trenches Monitor stopped`
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
            const isBlacklisted = await this.fileStorageClient.isInTwitterBlacklist(twitterUsername);
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
          
          // Auto-add Twitter account to blacklist after processing
          if (twitterUsername) {
            try {
              const addedCount = await this.fileStorageClient.addToTwitterBlacklist([twitterUsername]);
              if (addedCount > 0) {
                console.log(`Auto-blacklisted Twitter @${twitterUsername} for creator ${creator.name}`);
              }
            } catch (error) {
              console.error(`Error auto-blacklisting Twitter @${twitterUsername}:`, error);
            }
          }
          
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
        // All follower data now comes from GraphQL, no external API caches needed
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

    // Check all social networks from GraphQL data
    const socialNetworks = [
      { name: 'X', account: creator.creatorProfile.socialAccounts.twitter },
      { name: 'Farcaster', account: creator.creatorProfile.socialAccounts.farcaster },
      { name: 'TikTok', account: creator.creatorProfile.socialAccounts.tiktok },
      { name: 'Instagram', account: creator.creatorProfile.socialAccounts.instagram }
    ];

    for (const network of socialNetworks) {
      if (network.account?.followerCount) {
        const followers = network.account.followerCount;
        
        if (followers > maxFollowers) {
          maxFollowers = followers;
          platform = network.name;
        }
        
        if (followers >= config.highFollowersThreshold) {
          return { 
            isHigh: true, 
            reason: `${network.name}: ${followers.toLocaleString('en-US')} followers`, 
            maxFollowers: followers 
          };
        }
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
      const isInList = await this.fileStorageClient.isInAlphaList(username);
      if (isInList) {
        const description = await this.fileStorageClient.getAlphaUserDescription(username);
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
    console.log('Cache cleared');
  }
} 