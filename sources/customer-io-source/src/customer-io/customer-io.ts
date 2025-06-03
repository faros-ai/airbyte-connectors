import axios, {AxiosError, AxiosInstance} from 'axios';
import {VError} from 'verror';

import {
  CustomerIOCampaign,
  CustomerIOCampaignAction,
  CustomerIOListCampaignActionsResponse,
  CustomerIOListCampaignsResponse,
  CustomerIOListNewsletterResponse,
  CustomerIONewsletter,
} from './typings';

const CUSTOMER_IO_API_URL = 'https://api.customer.io/v1';
const DEFAULT_CUTOFF_DAYS = 90;

export interface CustomerIOConfig {
  app_api_key: string;
  api_url?: string;
  cutoff_days?: number;
}

export class CustomerIO {
  private constructor(
    readonly axios: AxiosInstance,
    readonly startDate: Date
  ) {}

  static instance(
    config: CustomerIOConfig,
    axiosInstance?: AxiosInstance
  ): CustomerIO {
    const startDate = new Date();
    startDate.setDate(
      startDate.getDate() - (config.cutoff_days ?? DEFAULT_CUTOFF_DAYS)
    );
    return new CustomerIO(
      axiosInstance ??
        axios.create({
          baseURL: config.api_url ?? CUSTOMER_IO_API_URL,
          timeout: 30000,
          responseType: 'json',
          headers: {Authorization: `Bearer ${config.app_api_key}`},
        }),
      startDate
    );
  }

  async checkConnection(): Promise<void> {
    try {
      await this.axios.get('/campaigns');
    } catch (error) {
      if (
        (error as AxiosError).response &&
        (error as AxiosError).response.status === 401
      ) {
        throw new VError(
          'Customer.io authorization failed. Try changing your app api token'
        );
      }

      throw new VError(
        `Customer.io api request failed: ${(error as Error).message}`
      );
    }
  }

  async *getCampaigns(
    updated = 0
  ): AsyncGenerator<CustomerIOCampaign, any, any> {
    const updatedMaxSecs = Math.max(
      updated ?? 0,
      this.startDate.getTime() / 1000
    );
    const response =
      await this.axios.get<CustomerIOListCampaignsResponse>('/campaigns');

    for (const campaign of response.data.campaigns) {
      if (campaign.updated >= updatedMaxSecs) {
        yield campaign;
      }
    }
  }

  async *getCampaignActions(
    updated = 0
  ): AsyncGenerator<CustomerIOCampaignAction, any, any> {
    const updatedMaxSecs = Math.max(
      updated ?? 0,
      this.startDate.getTime() / 1000
    );
    const campaignsResponse =
      await this.axios.get<CustomerIOListCampaignsResponse>('/campaigns');

    for (const campaign of campaignsResponse.data.campaigns) {
      if (Array.isArray(campaign?.actions) && campaign.actions.length > 0) {
        let nextKey: string | undefined;

        do {
          const pageResponse =
            await this.axios.get<CustomerIOListCampaignActionsResponse>(
              `/campaigns/${campaign.id}/actions`,
              {params: {start: nextKey}}
            );

          nextKey = pageResponse.data.next || undefined;

          for (const action of pageResponse.data.actions ?? []) {
            if (action.updated >= updatedMaxSecs) {
              yield action;
            }
          }
        } while (nextKey);
      }
    }
  }

  async *getNewsletters(
    updated = 0
  ): AsyncGenerator<CustomerIONewsletter, any, any> {
    const updatedMaxSecs = Math.max(
      updated ?? 0,
      this.startDate.getTime() / 1000
    );
    const response =
      await this.axios.get<CustomerIOListNewsletterResponse>('/newsletters');

    for (const newsletter of response.data.newsletters) {
      if (newsletter.updated >= updatedMaxSecs) {
        yield newsletter;
      }
    }
  }
}
