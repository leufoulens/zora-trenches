import * as fs from 'fs/promises';
import * as path from 'path';

interface AlphaUser {
  username: string;
  description?: string;
  addedAt: string;
}

interface TwitterBlacklistUser {
  username: string;
  addedAt: string;
}

interface StorageData {
  alphaList: AlphaUser[];
  twitterBlacklist: TwitterBlacklistUser[];
}

export class FileStorageClient {
  private readonly DATA_DIR = path.join(process.cwd(), 'data');
  private readonly ALPHA_LIST_FILE = path.join(this.DATA_DIR, 'alpha-list.json');
  private readonly TWITTER_BLACKLIST_FILE = path.join(this.DATA_DIR, 'twitter-blacklist.json');
  
  // In-memory cache for better performance
  private alphaListCache: AlphaUser[] = [];
  private twitterBlacklistCache: TwitterBlacklistUser[] = [];
  private cacheLoaded: boolean = false;

  constructor() {
    this.ensureDataDirectory();
  }

  private async ensureDataDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.DATA_DIR, { recursive: true });
    } catch (error) {
      console.error('Error creating data directory:', error);
    }
  }

  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;

    try {
      // Load alpha list
      try {
        const alphaData = await fs.readFile(this.ALPHA_LIST_FILE, 'utf-8');
        this.alphaListCache = JSON.parse(alphaData);
      } catch (error) {
        // File doesn't exist or is corrupted, start with empty array
        this.alphaListCache = [];
      }

      // Load twitter blacklist
      try {
        const blacklistData = await fs.readFile(this.TWITTER_BLACKLIST_FILE, 'utf-8');
        this.twitterBlacklistCache = JSON.parse(blacklistData);
      } catch (error) {
        // File doesn't exist or is corrupted, start with empty array
        this.twitterBlacklistCache = [];
      }

      this.cacheLoaded = true;
      console.log(`Loaded ${this.alphaListCache.length} alpha users and ${this.twitterBlacklistCache.length} blacklisted Twitter accounts`);
    } catch (error) {
      console.error('Error loading cache:', error);
      this.alphaListCache = [];
      this.twitterBlacklistCache = [];
      this.cacheLoaded = true;
    }
  }

  private async saveAlphaList(): Promise<void> {
    try {
      await fs.writeFile(this.ALPHA_LIST_FILE, JSON.stringify(this.alphaListCache, null, 2));
    } catch (error) {
      console.error('Error saving alpha list:', error);
      throw error;
    }
  }

  private async saveTwitterBlacklist(): Promise<void> {
    try {
      await fs.writeFile(this.TWITTER_BLACKLIST_FILE, JSON.stringify(this.twitterBlacklistCache, null, 2));
    } catch (error) {
      console.error('Error saving twitter blacklist:', error);
      throw error;
    }
  }

  // Alpha list management methods
  async addToAlphaListWithDescription(username: string, description?: string): Promise<boolean> {
    try {
      await this.loadCache();
      
      const normalizedUsername = username.toLowerCase().trim();
      
      // Check if user already exists
      const existingIndex = this.alphaListCache.findIndex(user => user.username === normalizedUsername);
      
      if (existingIndex >= 0) {
        // Update existing user
        this.alphaListCache[existingIndex].description = description?.trim() || undefined;
        this.alphaListCache[existingIndex].addedAt = new Date().toISOString();
      } else {
        // Add new user
        this.alphaListCache.push({
          username: normalizedUsername,
          description: description?.trim() || undefined,
          addedAt: new Date().toISOString()
        });
      }
      
      await this.saveAlphaList();
      return true;
    } catch (error) {
      console.error('Error adding to alpha list with description:', error);
      return false;
    }
  }

  async addToAlphaList(usernames: string[]): Promise<number> {
    try {
      await this.loadCache();
      
      let addedCount = 0;
      
      for (const username of usernames) {
        const normalizedUsername = username.toLowerCase().trim();
        
        // Check if user already exists
        if (!this.alphaListCache.some(user => user.username === normalizedUsername)) {
          this.alphaListCache.push({
            username: normalizedUsername,
            addedAt: new Date().toISOString()
          });
          addedCount++;
        }
      }
      
      if (addedCount > 0) {
        await this.saveAlphaList();
      }
      
      return addedCount;
    } catch (error) {
      console.error('Error adding to alpha list:', error);
      return 0;
    }
  }

  async getAlphaUserDescription(username: string): Promise<string | null> {
    try {
      await this.loadCache();
      
      const normalizedUsername = username.toLowerCase().trim();
      const user = this.alphaListCache.find(user => user.username === normalizedUsername);
      
      return user?.description || null;
    } catch (error) {
      console.error('Error getting alpha user description:', error);
      return null;
    }
  }

  async removeFromAlphaList(username: string): Promise<boolean> {
    try {
      await this.loadCache();
      
      const normalizedUsername = username.toLowerCase().trim();
      const initialLength = this.alphaListCache.length;
      
      this.alphaListCache = this.alphaListCache.filter(user => user.username !== normalizedUsername);
      
      if (this.alphaListCache.length < initialLength) {
        await this.saveAlphaList();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error removing from alpha list:', error);
      return false;
    }
  }

  async isInAlphaList(username: string): Promise<boolean> {
    try {
      await this.loadCache();
      
      const normalizedUsername = username.toLowerCase().trim();
      return this.alphaListCache.some(user => user.username === normalizedUsername);
    } catch (error) {
      console.error('Error checking alpha list:', error);
      return false;
    }
  }

  async getAlphaList(): Promise<string[]> {
    try {
      await this.loadCache();
      
      return this.alphaListCache
        .map(user => user.username)
        .sort();
    } catch (error) {
      console.error('Error getting alpha list:', error);
      return [];
    }
  }

  async getAlphaListWithDescriptions(): Promise<{username: string, description?: string}[]> {
    try {
      await this.loadCache();
      
      return this.alphaListCache
        .map(user => ({
          username: user.username,
          description: user.description
        }))
        .sort((a, b) => a.username.localeCompare(b.username));
    } catch (error) {
      console.error('Error getting alpha list with descriptions:', error);
      return [];
    }
  }

  async getAlphaListCount(): Promise<number> {
    try {
      await this.loadCache();
      return this.alphaListCache.length;
    } catch (error) {
      console.error('Error getting alpha list count:', error);
      return 0;
    }
  }

  // Twitter blacklist management methods
  async addToTwitterBlacklist(usernames: string[]): Promise<number> {
    try {
      await this.loadCache();
      
      let addedCount = 0;
      
      for (const username of usernames) {
        const normalizedUsername = username.toLowerCase().trim();
        
        // Check if user already exists
        if (!this.twitterBlacklistCache.some(user => user.username === normalizedUsername)) {
          this.twitterBlacklistCache.push({
            username: normalizedUsername,
            addedAt: new Date().toISOString()
          });
          addedCount++;
        }
      }
      
      if (addedCount > 0) {
        await this.saveTwitterBlacklist();
      }
      
      return addedCount;
    } catch (error) {
      console.error('Error adding to twitter blacklist:', error);
      return 0;
    }
  }

  async removeFromTwitterBlacklist(username: string): Promise<boolean> {
    try {
      await this.loadCache();
      
      const normalizedUsername = username.toLowerCase().trim();
      const initialLength = this.twitterBlacklistCache.length;
      
      this.twitterBlacklistCache = this.twitterBlacklistCache.filter(user => user.username !== normalizedUsername);
      
      if (this.twitterBlacklistCache.length < initialLength) {
        await this.saveTwitterBlacklist();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error removing from twitter blacklist:', error);
      return false;
    }
  }

  async isInTwitterBlacklist(username: string): Promise<boolean> {
    try {
      await this.loadCache();
      
      const normalizedUsername = username.toLowerCase().trim();
      return this.twitterBlacklistCache.some(user => user.username === normalizedUsername);
    } catch (error) {
      console.error('Error checking twitter blacklist:', error);
      return false;
    }
  }

  async getTwitterBlacklist(): Promise<string[]> {
    try {
      await this.loadCache();
      
      return this.twitterBlacklistCache
        .map(user => user.username)
        .sort();
    } catch (error) {
      console.error('Error getting twitter blacklist:', error);
      return [];
    }
  }

  async getTwitterBlacklistCount(): Promise<number> {
    try {
      await this.loadCache();
      return this.twitterBlacklistCache.length;
    } catch (error) {
      console.error('Error getting twitter blacklist count:', error);
      return 0;
    }
  }

  // Utility methods for maintenance
  async clearAlphaList(): Promise<void> {
    try {
      this.alphaListCache = [];
      await this.saveAlphaList();
      console.log('Alpha list cleared');
    } catch (error) {
      console.error('Error clearing alpha list:', error);
    }
  }

  async clearTwitterBlacklist(): Promise<void> {
    try {
      this.twitterBlacklistCache = [];
      await this.saveTwitterBlacklist();
      console.log('Twitter blacklist cleared');
    } catch (error) {
      console.error('Error clearing twitter blacklist:', error);
    }
  }

  // Method to get statistics
  async getStatistics(): Promise<{alphaCount: number, blacklistCount: number}> {
    await this.loadCache();
    return {
      alphaCount: this.alphaListCache.length,
      blacklistCount: this.twitterBlacklistCache.length
    };
  }

  // Method to export all data (for backup)
  async exportData(): Promise<StorageData> {
    await this.loadCache();
    return {
      alphaList: [...this.alphaListCache],
      twitterBlacklist: [...this.twitterBlacklistCache]
    };
  }

  // Method to import data (for restore)
  async importData(data: StorageData): Promise<void> {
    try {
      this.alphaListCache = data.alphaList || [];
      this.twitterBlacklistCache = data.twitterBlacklist || [];
      
      await this.saveAlphaList();
      await this.saveTwitterBlacklist();
      
      console.log(`Imported ${this.alphaListCache.length} alpha users and ${this.twitterBlacklistCache.length} blacklisted Twitter accounts`);
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  }
}

