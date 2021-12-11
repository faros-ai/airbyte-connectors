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

const CUSTOMER_IO_BETA_API_URL = 'https://beta-api.customer.io/v1/api';

export interface CustomerIOConfig {
  app_api_key: string;
}

export class CustomerIO {
  private constructor(readonly axios: AxiosInstance) {}

  static instance(
    config: CustomerIOConfig,
    axiosInstance?: AxiosInstance
  ): CustomerIO {
    return new CustomerIO(
      axiosInstance ??
        axios.create({
          baseURL: CUSTOMER_IO_BETA_API_URL,
          timeout: 30000,
          responseType: 'json',
          headers: {Authorization: `Bearer ${config.app_api_key}`},
        })
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
    const response = await this.axios.get<CustomerIOListCampaignsResponse>(
      '/campaigns'
    );

    for (const campaign of response.data.campaigns) {
      if (campaign.updated >= updated) {
        yield campaign;
      }
    }
  }

  async *getCampaignActions(
    updated = 0
  ): AsyncGenerator<CustomerIOCampaignAction, any, any> {
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
            if (action.updated >= updated) {
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
    const response = await this.axios.get<CustomerIOListNewsletterResponse>(
      '/newsletters'
    );

    for (const newsletter of response.data.newsletters) {
      if (newsletter.updated >= updated) {
        yield newsletter;
      }
    }
  }
}
