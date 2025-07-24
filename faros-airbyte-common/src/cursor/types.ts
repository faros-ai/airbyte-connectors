export type MemberItem = {
  name: string;
  email: string;
  role: 'owner' | 'member' | 'free-owner';
};

export type DailyUsageItem = {
  date: number;
  isActive: boolean;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  acceptedLinesAdded: number;
  acceptedLinesDeleted: number;
  totalApplies: number;
  totalAccepts: number;
  totalRejects: number;
  totalTabsShown: number;
  totalTabsAccepted: number;
  composerRequests: number;
  chatRequests: number;
  agentRequests: number;
  cmdkUsages: number;
  subscriptionIncludedReqs: number;
  apiKeyReqs: number;
  usageBasedReqs: number;
  bugbotUsages: number;
  mostUsedModel: string;
  applyMostUsedExtension: string;
  tabMostUsedExtension: string;
  clientVersion: string;
  email?: string;
};

export type UsageEventItem = {
  timestamp: string;
  model: string;
  kindLabel: string;
  maxMode: boolean;
  requestsCosts: number;
  isTokenBasedCall: boolean;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    totalCents: number;
  };
  isFreeBugbot: boolean;
  userEmail: string;
  minUsageTimestamp?: number;
};
