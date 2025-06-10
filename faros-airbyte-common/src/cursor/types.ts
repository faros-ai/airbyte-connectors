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
  minUsageDate?: number;
};
