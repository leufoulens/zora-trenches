import axios, { AxiosInstance } from 'axios';
import { FarcasterApiResponse } from './types';

export class FarcasterClient {
  private client: AxiosInstance;
  private cache: Map<string, { followers: number; following: number; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  constructor() {
    this.client = axios.create({
      baseURL: 'https://client.farcaster.xyz',
      timeout: 10000,
      headers: {
        'User-Agent': 'ZoraTrenchesMonitor/1.0',
      }
    });
  }

  async getUserData(username: string): Promise<{ followers: number; following: number } | null> {
    try {
      // Check cache
      const cached = this.cache.get(username);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return { followers: cached.followers, following: cached.following };
      }

      // Encode username for URL
      const encodedUsername = encodeURIComponent(username);
      
      const response = await this.client.get<FarcasterApiResponse>(
        `/v2/user-by-username?username=${encodedUsername}`
      );

      if (response.data.result?.user) {
        const user = response.data.result.user;
        const followers = user.followerCount;
        const following = user.followingCount;
        
        // Save to cache
        this.cache.set(username, {
          followers,
          following,
          timestamp: Date.now()
        });

        console.log(`Farcaster API: @${username} has ${followers} followers, ${following} following`);
        return { followers, following };
      }

      console.warn(`Farcaster API: Failed to get data for @${username}`);
      return null;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          console.warn(`Farcaster API: User @${username} not found`);
        } else if (error.response?.status === 429) {
          console.warn(`Farcaster API: Rate limit exceeded, skipping @${username}`);
        } else {
          console.error(`Farcaster API error for @${username}:`, error.response?.status, error.message);
        }
      } else {
        console.error(`Farcaster API unknown error for @${username}:`, error);
      }
      return null;
    }
  }

  async getFollowersCount(username: string): Promise<number | null> {
    const data = await this.getUserData(username);
    return data?.followers || null;
  }

  async getFollowingCount(username: string): Promise<number | null> {
    const data = await this.getUserData(username);
    return data?.following || null;
  }

  // Method for cache cleanup
  clearCache(): void {
    this.cache.clear();
    console.log('Farcaster API cache cleared');
  }

  // Method for getting cache size
  getCacheSize(): number {
    return this.cache.size;
  }
} 