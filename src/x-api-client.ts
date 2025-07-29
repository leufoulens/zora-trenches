import axios, { AxiosInstance } from 'axios';
import { XApiResponse } from './types';
import { config } from './config';

export class XApiClient {
  private client: AxiosInstance;
  private cache: Map<string, { followers: number; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.twitterapi.io',
      timeout: 10000,
      headers: {
        'X-API-Key': config.xApiKey,
      }
    });
  }

  async getFollowersCount(username: string): Promise<number | null> {
    try {
      // Check cache
      const cached = this.cache.get(username);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.followers;
      }

      // Encode username for URL
      const encodedUsername = encodeURIComponent(username);
      
      const response = await this.client.get<XApiResponse>(
        `/twitter/user/info?userName=${encodedUsername}`
      );

      if (response.data.status === 'success' && response.data.data) {
        const followers = response.data.data.followers;
        
        // Save to cache
        this.cache.set(username, {
          followers,
          timestamp: Date.now()
        });

        console.log(`X API: @${username} has ${followers} followers`);
        return followers;
      }

      console.warn(`X API: Failed to get data for @${username}`);
      return null;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          console.warn(`X API: User @${username} not found`);
        } else if (error.response?.status === 429) {
          console.warn(`X API: Rate limit exceeded, skipping @${username}`);
        } else {
          console.error(`X API error for @${username}:`, error.response?.status, error.message);
        }
      } else {
        console.error(`X API unknown error for @${username}:`, error);
      }
      return null;
    }
  }

  // Method for cache cleanup
  clearCache(): void {
    this.cache.clear();
    console.log('X API cache cleared');
  }

  // Method for getting cache size
  getCacheSize(): number {
    return this.cache.size;
  }
} 