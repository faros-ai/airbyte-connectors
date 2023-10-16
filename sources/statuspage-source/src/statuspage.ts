import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {
  Component,
  ComponentGroup,
  ComponentUptime,
  Incident,
  Page,
  User,
} from './types';

const BASE_URL = 'https://api.statuspage.io/v1/';
const DEFAULT_MAX_RETRIES = 3;
const MAX_PAGE_SIZE = 100;
const RATE_LIMIT_INTERVAL_SECS = 60;

export interface StatuspageConfig {
  readonly api_key: string;
  readonly cutoff_days: number;
  readonly org_id?: string;
  readonly page_ids?: ReadonlyArray<string>;
  readonly max_retries?: number;
  readonly page_size?: number;
  readonly fetch_component_uptime?: boolean;
}

export class Statuspage {
  private static statuspage: Statuspage = null;

  constructor(
    private readonly api: AxiosInstance,
    private readonly startDate: Date,
    private readonly logger: AirbyteLogger,
    private readonly maxRetries: number = DEFAULT_MAX_RETRIES,
    private readonly pageSize: number = MAX_PAGE_SIZE
  ) {}

  static instance(config: StatuspageConfig, logger: AirbyteLogger): Statuspage {
    if (Statuspage.statuspage) return Statuspage.statuspage;

    if (!config.api_key) {
      throw new VError('api_key must not be an empty string');
    }
    if (!(Number.isInteger(config.cutoff_days) && config.cutoff_days > 0)) {
      throw new VError('cutoff_days must be an integer greater than 0');
    }
    const maxRetries = config.max_retries ?? DEFAULT_MAX_RETRIES;
    if (!(Number.isInteger(maxRetries) && maxRetries > 0)) {
      throw new VError(`max_retries must be an integer greater than 0`);
    }
    const pageSize = config.page_size ?? MAX_PAGE_SIZE;
    if (!(Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100)) {
      throw new VError(
        `page_size must be an integer between 1 and ${MAX_PAGE_SIZE}`
      );
    }
    const httpClient = axios.create({
      baseURL: BASE_URL,
      timeout: 30000, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes
      headers: {
        Authorization: `OAuth ${config.api_key}`,
      },
    });
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);
    Statuspage.statuspage = new Statuspage(
      httpClient,
      startDate,
      logger,
      config.max_retries,
      pageSize
    );
    return Statuspage.statuspage;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.api.get('/pages');
    } catch (err: any) {
      let errorMessage = 'Please verify your token is correct. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private async rateLimitGet<T = any>(
    path: string,
    attempt = 1
  ): Promise<AxiosResponse<T> | undefined> {
    try {
      return await this.api.get(path);
    } catch (err: any) {
      if (
        (err?.response?.status === 420 || err?.response?.status === 429) &&
        attempt <= this.maxRetries
      ) {
        this.logger.warn(
          `Request to ${path} was rate limited. ` +
            `Retrying in ${RATE_LIMIT_INTERVAL_SECS} seconds...` +
            `(attempt ${attempt} of ${this.maxRetries})`
        );
        await this.sleep(RATE_LIMIT_INTERVAL_SECS * 1000);
        return await this.rateLimitGet(path, attempt + 1);
      }
      throw wrapApiError(err, `Failed to get ${path}. `);
    }
  }

  private async *paginate<T>(
    resource: string,
    pageSizeParam: string
  ): AsyncGenerator<T> {
    let page = 1;
    let morePages: boolean;
    do {
      const params = new URLSearchParams({
        page: `${page}`,
        [pageSizeParam]: `${this.pageSize}`,
      });
      const response: AxiosResponse<T[]> = await this.rateLimitGet(
        `${resource}?${params}`
      );
      for (const item of response.data) {
        yield item;
      }
      page++;
      morePages = response.data.length === this.pageSize;
    } while (morePages);
  }

  async *getIncidents(
    pageId: string,
    lastUpdatedAt?: Date
  ): AsyncGenerator<Incident> {
    const startTime =
      lastUpdatedAt > this.startDate ? lastUpdatedAt : this.startDate;
    for await (const incident of this.paginate<Incident>(
      `/pages/${pageId}/incidents`,
      'limit'
    )) {
      if (new Date(incident.updated_at ?? 0) > startTime) {
        yield incident;
      }
    }
  }

  @Memoize()
  async getPages(pageIds?: ReadonlyArray<string>): Promise<Page[]> {
    // this API does not paginate results
    const response: AxiosResponse<Page[]> = await this.rateLimitGet('/pages');
    const results = [];
    for (const page of response.data) {
      if (pageIds && pageIds.length > 0 && !pageIds.includes(page.id)) {
        continue;
      }
      results.push(page);
    }
    return results;
  }

  async *getUsers(orgId?: string): AsyncGenerator<User> {
    if (orgId) {
      for await (const user of this.paginate<User>(
        `/organizations/${orgId}/users`,
        'per_page'
      )) {
        yield user;
      }
    } else {
      this.logger.warn('Org_id not provided. Cannot fetch Statuspage users.');
    }
  }

  async *getComponents(pageId: string): AsyncGenerator<Component> {
    for await (const component of this.paginate<Component>(
      `/pages/${pageId}/components`,
      'per_page'
    )) {
      yield component;
    }
  }

  async *getComponentGroups(pageId: string): AsyncGenerator<ComponentGroup> {
    for await (const group of this.paginate<ComponentGroup>(
      `/pages/${pageId}/component-groups`,
      'per_page'
    )) {
      yield group;
    }
  }

  // Uptime is a pre-computed metric. We will get the value for each day
  // (most granular value) up to the previous day.
  async *getComponentUptime(
    pageId: string,
    componentId: string,
    componentStartDate: Date,
    componentGroupId?: string,
    rangeEndDate?: Date
  ): AsyncGenerator<ComponentUptime> {
    const path = `/pages/${pageId}/components/${componentId}/uptime`;
    const getFormattedDate = (date: Date): string => {
      const year = date.getFullYear().toString();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Instantiate new date object to avoid mutating the original.
    const rangeStart = new Date(
      this.getComponentUptimeRangeStart(componentStartDate, rangeEndDate)
    );

    // Use start of day to avoid partial days.
    const currentDate = new Date(getFormattedDate(new Date()));

    while (rangeStart < currentDate) {
      const start = getFormattedDate(rangeStart);
      // Start and end are the same so we get a value for a single day.
      const params = new URLSearchParams({
        start: `${start}`,
        end: `${start}`,
      });
      const {data}: AxiosResponse<ComponentUptime> = await this.rateLimitGet(
        `${path}?${params}`
      );
      yield {...data, page_id: pageId, group_id: componentGroupId};

      rangeStart.setDate(rangeStart.getDate() + 1);
    }
  }

  private getComponentUptimeRangeStart(
    componentStartDate: Date,
    rangeEndDate: Date
  ): Date {
    // Can only get uptimes for the last 90 days.
    const maxStartDate = new Date();
    maxStartDate.setDate(maxStartDate.getDate() - 90);

    // If the component was created after the max range start,
    // use the component start date.
    const startDate =
      componentStartDate > maxStartDate ? componentStartDate : maxStartDate;

    // If a defined cutoff date is after start date use that.
    const cutoff = this.startDate > startDate ? this.startDate : startDate;

    // Use range end date is defined and is after the cutoff date,
    return rangeEndDate > cutoff ? rangeEndDate : cutoff;
  }
}
