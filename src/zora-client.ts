import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ExploreListResponse, VcFollowingResponse } from './types';
import { config } from './config';

export class ZoraClient {
  private client: AxiosInstance;

  constructor() {
    // Create proxy agent
    const proxyAgent = new HttpsProxyAgent(
      `http://${config.proxyUsername}:${config.proxyPassword}@${config.proxyHost}:${config.proxyPort}`
    );

    this.client = axios.create({
      baseURL: config.zoraEndpointUrl,
      timeout: 30000,
      httpAgent: proxyAgent,
      httpsAgent: proxyAgent,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ZoraTrenchesMonitor/1.0',
      }
    });
  }

  async getNewCreators(): Promise<ExploreListResponse> {
    const query = `
      query GetListOfNewCreators {
  exploreList(listType: NEW_CREATORS, first: 10) {
    edges {
      node {
        address
        name
        createdAt
        creatorProfile {
          ... on GraphQLAccountProfile {
            id
            followedEdges {
              count
            }
            username
            socialAccounts {
              farcaster {
                displayName
                username
                followerCount
              }
              twitter {
                displayName
                username
                followerCount
              }
              tiktok {
                displayName
                username
                followerCount
              }
              instagram {
                displayName
                followerCount
                username
              }
            }
            createdCoins(first: 100) {
              edges {
                node {
                  name
                  address
                  marketCap
                }
              }
            }
          }
        }
      }
    }
  }
}
    `;

    try {
      const response = await this.client.post('', {
        query: query.trim()
      });

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Zora API request error: ${error.message} ${error.response?.status ? `(${error.response.status})` : ''}`);
      }
      throw error;
    }
  }

  async getVcFollowing(username: string): Promise<VcFollowingResponse> {
    const query = `
     query GetVcFollowing {
        profile(identifier: "${username}") {
            followersInVcFollowing {
                edges {
                     node {
                        ... on GraphQLAccountProfile {
                            id
                            username
                        }
                    }
                }
            }
        }
    }
    `;

    try {
      const response = await this.client.post('', {
        query: query.trim()
      });

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Zora API request error: ${error.message} ${error.response?.status ? `(${error.response.status})` : ''}`);
      }
      throw error;
    }
  }
} 