export interface SocialAccount {
  displayName: string | null;
  username: string | null;
  followerCount?: number | null;
}

export interface SocialAccounts {
  farcaster: SocialAccount | null;
  twitter: SocialAccount | null;
  tiktok: SocialAccount | null;
  instagram: SocialAccount | null;
}

export interface CreatedCoin {
  name: string;
  address: string;
  marketCap: string;
}

export interface CreatorProfile {
  id: string;
  followedEdges: {
    count: number;
  };
  username: string;
  socialAccounts: SocialAccounts;
  vcFollowingStatus: string;
  followersInVcFollowing: {
    count: number;
  };
  createdCoins: {
    edges: {
      node: CreatedCoin;
    }[];
  };
}

export interface Creator {
  address: string;
  name: string;
  createdAt: string;
  creatorProfile: CreatorProfile;
}

export interface ExploreListResponse {
  data: {
    exploreList: {
      edges: {
        node: Creator;
      }[];
    };
  };
}

export interface VcFollowingResponse {
  data: {
    profile: {
      followersInVcFollowing: {
        edges: {
          node: {
            id: string;
            username: string;
          };
        }[];
      };
    };
  };
}

// Типы для X API
export interface XApiUserData {
  id: string;
  name: string;
  userName: string;
  location: string;
  url: string;
  description: string;
  entities: {
    description: object;
  };
  protected: boolean;
  isVerified: boolean;
  isBlueVerified: boolean;
  verifiedType: string | null;
  followers: number;
  following: number;
  favouritesCount: number;
  statusesCount: number;
  mediaCount: number;
  createdAt: string;
  coverPicture: string | null;
  profilePicture: string;
  canDm: boolean;
  affiliatesHighlightedLabel: object;
  isAutomated: boolean;
  automatedBy: string | null;
  pinnedTweetIds: any[];
}

export interface XApiResponse {
  status: string;
  msg: string;
  data: XApiUserData;
}

// Типы для Farcaster API
export interface FarcasterProfile {
  bio: {
    text: string;
    mentions: string[];
    channelMentions: string[];
  };
  location: {
    placeId: string;
    description: string;
  };
  earlyWalletAdopter?: boolean;
}

export interface FarcasterPfp {
  url: string;
  verified: boolean;
}

export interface FarcasterConnectedAccount {
  connectedAccountId: string;
  platform: string;
  username: string;
  expired: boolean;
}

export interface FarcasterViewerContext {
  following: boolean;
  followedBy: boolean;
  canSendDirectCasts: boolean;
  enableNotifications: boolean;
  hasUploadedInboxKeys: boolean;
}

export interface FarcasterWalletLabel {
  address: string;
  labels: string[];
}

export interface FarcasterExtras {
  fid: number;
  custodyAddress: string;
  ethWallets: string[];
  solanaWallets: string[];
  walletLabels: FarcasterWalletLabel[];
  v2: boolean;
  publicSpamLabel: string;
}

export interface FarcasterUser {
  fid: number;
  displayName: string;
  profile: FarcasterProfile;
  followerCount: number;
  followingCount: number;
  username: string;
  pfp: FarcasterPfp;
  connectedAccounts: FarcasterConnectedAccount[];
  viewerContext: FarcasterViewerContext;
}

export interface FarcasterApiResponse {
  result: {
    user: FarcasterUser;
    collectionsOwned: any[];
    extras: FarcasterExtras;
  };
}

// Типы для Telegram Inline Keyboard
export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface Config {
  zoraEndpointUrl: string;
  telegramBotToken: string;
  telegramChatGeneral: string;
  telegramChatHigh: string;
  redisUrl: string;
  proxyHost: string;
  proxyPort: number;
  proxyUsername: string;
  proxyPassword: string;
  pollIntervalSeconds: number;
  highFollowersThreshold: number;
  xApiKey: string;
  zoraApiKey: string;
} 