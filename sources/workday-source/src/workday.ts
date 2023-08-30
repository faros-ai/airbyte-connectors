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
    private readonly baseUrl: string,
    private readonly tenant: string,
    private readonly customReportName?: string,
    private readonly username?: string,
    private readonly password?: string
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
    if (!cfg.baseUrl) {
      throw new VError('baseUrl must not be an empty string');
    }
    if (cfg.customReportName) {
      if (!cfg.username) {
        throw new VError(
          'When getting custom reports, username must not be an empty string'
        );
      }
      if (!cfg.password) {
        throw new VError(
          'When getting custom reports, password must not be an empty string'
        );
      }
    }

    const baseUrl = new URL(cfg.baseUrl);
    const timeout = cfg.timeout ?? 60000;

    const accessToken = await Workday.getAccessToken(baseUrl, cfg, logger);
    const api = axios.create({
      timeout: timeout, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes,
      maxBodyLength: Infinity, //default is 2000 bytes,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
    });

    return new Workday(
      logger,
      api,
      cfg.limit ?? DEFAULT_PAGE_LIMIT,
      baseUrl.toString(),
      cfg.tenant,
      cfg.customReportName,
      cfg.username,
      cfg.password
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
    return `${this.baseUrl}/api/${version}/${this.tenant}`;
  }

  async checkConnection(): Promise<void> {
    const res = [];
    for await (const org of this.workers(1, 1)) {
      res.push(org);
    }
    if (res.length <= 0) {
      throw new VError('No workers were found');
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

  async *customReports(customReportName: string): AsyncGenerator<any> {
    // Note input param path should start with '/'
    const baseURL = `${this.baseUrl}/service/customreport2/${this.tenant}`;
    const complete_path = `${baseURL}/${customReportName}`;
    this.logger.info(`Custom Reports full path URL: ${complete_path}`);
    const basic_pw = Buffer.from(`${this.username}:${this.password}`).toString(
      'base64'
    );
    const res = await this.api.get(complete_path, {
      headers: {Authorization: `Basic ${basic_pw}`},
      params: {format: 'json'},
    });
    for (const item of res.data?.Report_Entry ?? []) {
      yield item;
    }
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
