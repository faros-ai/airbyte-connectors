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
