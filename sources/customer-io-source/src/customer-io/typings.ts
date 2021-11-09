export interface CustomerIOListCampaignsResponse {
  campaigns: CustomerIOCampaign[];
}

export interface CustomerIOCampaign {
  id: number;
  updated: number;
  actions?: CustomerIOCampaignAction[];
}

export interface CustomerIOListCampaignActionsResponse {
  actions: CustomerIOCampaignAction[];
  next: string;
}

export interface CustomerIOCampaignAction {
  id: string;
  updated: number;
}

export interface CustomerIOListNewsletterResponse {
  newsletters: CustomerIONewsletter[];
}

export interface CustomerIONewsletter {
  id: number;
  updated: number;
}
