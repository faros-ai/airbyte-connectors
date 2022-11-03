import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {WorkdayConfig} from '.';
import {
  Person,
  SupervisoryOrganization,
  SupervisoryOrganizationOrgChart,
  Worker,
} from './types';

const DEFAULT_PAGE_LIMIT = 20;
const DEFAULT_BASE_URL = 'https://wd2-impl-services1.workday.com/ccx/';
const VERSION_PLACEHOLDER = '<VERSION>';

export interface Page<T> {
  data: ReadonlyArray<T>;
  total: number;
}

/**
 * Workday REST API client
 *
 * Based on:
 *  1. https://github.com/Workday/workday-prism-analytics-data-loader
 *  2. https://github.com/Workday/prism-python
 *  3. https://community.workday.com/sites/default/files/file-hosting/restapi/
 */
export class Workday {
  constructor(
    private readonly logger: AirbyteLogger,
    private readonly api: AxiosInstance,
    private readonly limit: number,
    private readonly apiBaseUrlTemplate: string
  ) {}

  static async instance(
    cfg: WorkdayConfig,
    logger: AirbyteLogger
  ): Promise<Workday> {
    if (!cfg.tenant) {
      throw new VError('tenant must not be an empty string');
    }
    if (!cfg.clientId) {
      throw new VError('clientId must not be an empty string');
    }
    if (!cfg.clientSecret) {
      throw new VError('clientSecret must not be an empty string');
    }
    if (!cfg.refreshToken) {
      throw new VError('refreshToken must not be an empty string');
    }

    const baseURL = new URL(cfg.baseUrl ?? DEFAULT_BASE_URL);
    const apiBaseUrlTemplate =
      baseURL.toString() + `/api/${VERSION_PLACEHOLDER}/${cfg.tenant}`;
    logger.debug('Assuming API base url template: %s', apiBaseUrlTemplate);

    const accessToken = await Workday.getAccessToken(baseURL, cfg, logger);
    const api = axios.create({
      timeout: 30000, // default is `0` (no timeout)
      maxContentLength: 10000000, //default is 2000 bytes,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
    });

    return new Workday(
      logger,
      api,
      cfg.limit ?? DEFAULT_PAGE_LIMIT,
      apiBaseUrlTemplate
    );
  }

  private static async getAccessToken(
    baseURL: URL,
    cfg: WorkdayConfig,
    logger: AirbyteLogger
  ): Promise<string> {
    const authUrl = baseURL.toString() + `/oauth2/${cfg.tenant}/token`;
    logger.debug('Requesting an access token from: %s', authUrl);

    const data = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cfg.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
    const res = await axios.post(authUrl, data.toString(), {
      headers: {'content-type': 'application/x-www-form-urlencoded'},
    });
    // Expecting data of type: {refresh_token, token_type, access_token}
    return res.data.access_token;
  }

  private apiBaseUrl(version: string): string {
    return this.apiBaseUrlTemplate.replace(VERSION_PLACEHOLDER, version);
  }

  async checkConnection(): Promise<void> {
    const res = [];
    for await (const org of this.orgs(1, 1)) {
      res.push(org);
    }
  }

  workers(limit = this.limit, maxPages = Infinity): AsyncGenerator<Worker> {
    const baseURL = this.apiBaseUrl('v4');
    return this.paginate(limit, maxPages, (limit, offset) =>
      this.api.get('/workers', {
        baseURL,
        params: {limit, offset},
      })
    );
  }

  people(limit = this.limit, maxPages = Infinity): AsyncGenerator<Person> {
    const baseURL = this.apiBaseUrl('v2');
    return this.paginate(limit, maxPages, (limit, offset) =>
      this.api.get('/people', {
        baseURL,
        params: {limit, offset},
      })
    );
  }

  // TODO: consider creating a single intance of this class and memoizing the 'orgs' response
  orgs(
    limit = this.limit,
    maxPages = Infinity
  ): AsyncGenerator<SupervisoryOrganization> {
    const baseURL = this.apiBaseUrl('v4');
    return this.paginate(limit, maxPages, (limit, offset) =>
      this.api.get('/supervisoryOrganizations', {
        baseURL,
        params: {limit, offset},
      })
    );
  }

  async *orgCharts(
    limit = this.limit,
    maxPages = Infinity
  ): AsyncGenerator<SupervisoryOrganizationOrgChart> {
    const baseURL = this.apiBaseUrl('v4');

    for await (const org of this.orgs(limit, maxPages)) {
      const orgCharts = this.paginate<SupervisoryOrganizationOrgChart>(
        limit,
        maxPages,
        (limit, offset) =>
          this.api.get(`/supervisoryOrganizations/${org.id}/orgChart`, {
            baseURL,
            params: {limit, offset},
          })
      );
      for await (const orgChart of orgCharts) {
        yield orgChart;
      }
    }
  }

  private async *paginate<T>(
    limit: number,
    maxPages: number,
    nextPage: (limit: number, offset: number) => Promise<AxiosResponse<Page<T>>>
  ): AsyncGenerator<T> {
    let offset = 0;
    let total = 0;
    let pages = 0;
    do {
      try {
        const res = await nextPage(limit, offset);
        for (const item of res.data.data) {
          yield item;
        }
        pages += 1;
        offset += limit;
        total = res.data.total ?? 0;
      } catch (e: any) {
        const w = wrapApiError(e);
        this.logger.error(w.message, w.stack);
        return;
      }
    } while (offset < total && pages < maxPages);
  }
}
