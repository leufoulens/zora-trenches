import { createClient, RedisClientType } from 'redis';
import { config } from './config';

export class RedisClient {
  private client: RedisClientType;
  private readonly PROCESSED_ADDRESSES_KEY = 'zora:processed_addresses';

  constructor() {
    this.client = createClient({
      url: config.redisUrl
    });

    this.client.on('error', (err) => {
      console.error('Redis error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis connection established');
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  async isAddressProcessed(address: string): Promise<boolean> {
    try {
      const result = await this.client.sIsMember(this.PROCESSED_ADDRESSES_KEY, address.toLowerCase());
      return result;
    } catch (error) {
      console.error(`Error checking address ${address}:`, error);
      return false;
    }
  }

  async markAddressAsProcessed(address: string): Promise<void> {
    try {
      await this.client.sAdd(this.PROCESSED_ADDRESSES_KEY, address.toLowerCase());
    } catch (error) {
      console.error(`Error saving address ${address}:`, error);
    }
  }

  async getProcessedAddressesCount(): Promise<number> {
    try {
      return await this.client.sCard(this.PROCESSED_ADDRESSES_KEY);
    } catch (error) {
      console.error('Error getting processed addresses count:', error);
      return 0;
    }
  }

  async clearProcessedAddresses(): Promise<void> {
    try {
      await this.client.del(this.PROCESSED_ADDRESSES_KEY);
      console.log('Processed addresses cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  // Alpha list management methods
  private readonly ALPHA_LIST_KEY = 'zora:alpha_list';
  private readonly ALPHA_DESCRIPTIONS_KEY = 'zora:alpha_descriptions';

  async addToAlphaList(usernames: string[]): Promise<number> {
    try {
      const normalizedUsernames = usernames.map(u => u.toLowerCase().trim());
      const result = await this.client.sAdd(this.ALPHA_LIST_KEY, normalizedUsernames);
      return result;
    } catch (error) {
      console.error('Error adding to alpha list:', error);
      return 0;
    }
  }

  async addToAlphaListWithDescription(username: string, description?: string): Promise<boolean> {
    try {
      const normalizedUsername = username.toLowerCase().trim();
      
      // Add to alpha list
      await this.client.sAdd(this.ALPHA_LIST_KEY, normalizedUsername);
      
      // Add description if provided
      if (description && description.trim()) {
        await this.client.hSet(this.ALPHA_DESCRIPTIONS_KEY, normalizedUsername, description.trim());
      }
      
      return true;
    } catch (error) {
      console.error('Error adding to alpha list with description:', error);
      return false;
    }
  }

  async getAlphaUserDescription(username: string): Promise<string | null> {
    try {
      const normalizedUsername = username.toLowerCase().trim();
      const description = await this.client.hGet(this.ALPHA_DESCRIPTIONS_KEY, normalizedUsername);
      return description || null;
    } catch (error) {
      console.error('Error getting alpha user description:', error);
      return null;
    }
  }

  async removeFromAlphaList(username: string): Promise<boolean> {
    try {
      const normalizedUsername = username.toLowerCase().trim();
      const result = await this.client.sRem(this.ALPHA_LIST_KEY, normalizedUsername);
      
      // Also remove description if exists
      if (result > 0) {
        await this.client.hDel(this.ALPHA_DESCRIPTIONS_KEY, normalizedUsername);
      }
      
      return result > 0;
    } catch (error) {
      console.error('Error removing from alpha list:', error);
      return false;
    }
  }

  async isInAlphaList(username: string): Promise<boolean> {
    try {
      const normalizedUsername = username.toLowerCase().trim();
      return await this.client.sIsMember(this.ALPHA_LIST_KEY, normalizedUsername);
    } catch (error) {
      console.error('Error checking alpha list:', error);
      return false;
    }
  }

  async getAlphaList(): Promise<string[]> {
    try {
      const members = await this.client.sMembers(this.ALPHA_LIST_KEY);
      return members.sort();
    } catch (error) {
      console.error('Error getting alpha list:', error);
      return [];
    }
  }

  async getAlphaListWithDescriptions(): Promise<{username: string, description?: string}[]> {
    try {
      const members = await this.client.sMembers(this.ALPHA_LIST_KEY);
      const descriptions = await this.client.hGetAll(this.ALPHA_DESCRIPTIONS_KEY);
      
      return members.sort().map(username => ({
        username,
        description: descriptions[username] || undefined
      }));
    } catch (error) {
      console.error('Error getting alpha list with descriptions:', error);
      return [];
    }
  }

  async getAlphaListCount(): Promise<number> {
    try {
      return await this.client.sCard(this.ALPHA_LIST_KEY);
    } catch (error) {
      console.error('Error getting alpha list count:', error);
      return 0;
    }
  }

  // Twitter blacklist management methods
  private readonly TWITTER_BLACKLIST_KEY = 'zora:twitter_blacklist';

  async addToTwitterBlacklist(usernames: string[]): Promise<number> {
    try {
      const normalizedUsernames = usernames.map(u => u.toLowerCase().trim());
      const result = await this.client.sAdd(this.TWITTER_BLACKLIST_KEY, normalizedUsernames);
      return result;
    } catch (error) {
      console.error('Error adding to twitter blacklist:', error);
      return 0;
    }
  }

  async removeFromTwitterBlacklist(username: string): Promise<boolean> {
    try {
      const normalizedUsername = username.toLowerCase().trim();
      const result = await this.client.sRem(this.TWITTER_BLACKLIST_KEY, normalizedUsername);
      return result > 0;
    } catch (error) {
      console.error('Error removing from twitter blacklist:', error);
      return false;
    }
  }

  async isInTwitterBlacklist(username: string): Promise<boolean> {
    try {
      const normalizedUsername = username.toLowerCase().trim();
      return await this.client.sIsMember(this.TWITTER_BLACKLIST_KEY, normalizedUsername);
    } catch (error) {
      console.error('Error checking twitter blacklist:', error);
      return false;
    }
  }

  async getTwitterBlacklist(): Promise<string[]> {
    try {
      const members = await this.client.sMembers(this.TWITTER_BLACKLIST_KEY);
      return members.sort();
    } catch (error) {
      console.error('Error getting twitter blacklist:', error);
      return [];
    }
  }

  async getTwitterBlacklistCount(): Promise<number> {
    try {
      return await this.client.sCard(this.TWITTER_BLACKLIST_KEY);
    } catch (error) {
      console.error('Error getting twitter blacklist count:', error);
      return 0;
    }
  }
} 