export type MemberItem = (ActiveMemberItem | InactiveMemberItem) & {
  minUsageTimestamp?: number;
};

export type ActiveMemberItem = {
  name: string;
  email: string;
  role: 'owner' | 'member' | 'free-owner';
  active: true;
};

export type InactiveMemberItem = {
  name?: never;
  email: string;
  role?: never;
  active: false;
};

export type DailyUsageItem = {
  date: number;
  day: string;
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
  userEmail?: string;
};

export type AiCommitMetricItem = {
  commitHash: string;
  userId: string;
  userEmail: string;
  repoName: string | null;
  branchName: string | null;
  isPrimaryBranch: boolean | null;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  tabLinesAdded: number;
  tabLinesDeleted: number;
  composerLinesAdded: number;
  composerLinesDeleted: number;
  nonAiLinesAdded: number | null;
  nonAiLinesDeleted: number | null;
  message: string | null;
  commitTs: string | null;
  createdAt: string;
};
