export interface CursorConfig {
  readonly cursor_api_key: string;
  readonly cursor_api_url?: string;
  readonly cutoff_days?: number;
  readonly timeout?: number;
  readonly start_date?: string;
  readonly end_date?: string;
  startDate?: Date;
  endDate?: Date;
}

// https://docs.cursor.com/account/teams/admin-api#get-team-members
export type MembersResponse = {
  teamMembers: {
    name: string;
    email: string;
    role: 'owner' | 'member' | 'free-owner';
  }[];
};

// https://docs.cursor.com/account/teams/admin-api#get-daily-usage-data
export type DailyUsageResponse = {
  data: {
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
  }[];
  period: {
    startDate: number;
    endDate: number;
  };
};

// https://docs.cursor.com/account/teams/admin-api#get-usage-events-data
export type UsageEventsResponse = {
  totalUsageEventsCount: number;
  pagination: {
    numPages: number;
    currentPage: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  usageEvents: {
    timestamp: string;
    model: string;
    kindLabel: string;
    maxMode: boolean;
    requestsCosts: number;
    isTokenBasedCall: boolean;
    tokenUsage: {
      inputTokens: number;
      outputTokens: number;
      cacheWriteTokens: number;
      cacheReadTokens: number;
      totalCents: number;
    };
    isFreeBugbot: boolean;
    userEmail: string;
  }[];
  period: {
    startDate: number;
    endDate: number;
  };
};
