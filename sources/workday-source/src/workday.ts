import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import Papa from 'papaparse';
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
 *  4. https://github.com/Workday/raas-python
 */
export class Workday {
  constructor(
    private readonly logger: AirbyteLogger,
    private readonly api: AxiosInstance,
    private readonly limit: number,
    private readonly baseUrl: string,
    private readonly tenant: string
  ) {}

  static async instance(
    cfg: WorkdayConfig,
    logger: AirbyteLogger
  ): Promise<Workday> {
    if (!cfg.tenant) {
      throw new VError('tenant must not be an empty string');
    }
    if (!cfg.credentials) {
      throw new VError('credentials must not be empty');
    }
    if (!cfg.baseUrl) {
      throw new VError('baseUrl must not be an empty string');
    }

    const timeout = cfg.timeout ?? 60000;
    const headers = {'content-type': 'application/json'};

    if (
      'refresh_token' in cfg.credentials &&
      'clientId' in cfg.credentials &&
      'clientSecret' in cfg.credentials
    ) {
      const res = await Workday.getAccessToken(cfg.baseUrl, cfg, logger);
      headers['authorization'] = `Bearer ${res.access_token}`;
    } else if ('password' in cfg.credentials && 'username' in cfg.credentials) {
      const usernamePass = `${cfg.credentials.username}:${cfg.credentials.password}`;
      const basic = Buffer.from(usernamePass).toString('base64');
      headers['authorization'] = `Basic ${basic}`;
    } else {
      throw new VError(
        'Invalid credentials! Either (refreshToken, clientId, clientSecret) OR (username, password) must be provided'
      );
    }
    const api = axios.create({
      timeout, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes,
      maxBodyLength: Infinity, //default is 2000 bytes,
      headers,
    });

    return new Workday(
      logger,
      api,
      cfg.limit ?? DEFAULT_PAGE_LIMIT,
      cfg.baseUrl,
      cfg.tenant
    );
  }

  private static async getAccessToken(
    baseURL: string,
    cfg: any,
    logger: AirbyteLogger
  ): Promise<{
    refresh_token: string;
    token_type: string;
    access_token: string;
  }> {
    const authUrl = ccxUrl(`/oauth2/${cfg.tenant}/token`, baseURL).toString();
    logger.debug('Requesting an access token - %s', authUrl);
    const data = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cfg.credentials.refreshToken,
      client_id: cfg.credentials.clientId,
      client_secret: cfg.credentials.clientSecret,
    });
    const res = await axios.post(authUrl, data.toString(), {
      headers: {'content-type': 'application/x-www-form-urlencoded'},
    });
    return res.data;
  }

  private apiBaseUrl(version: string): string {
    const apiBaseUrl = ccxUrl(`/api/${version}/${this.tenant}`, this.baseUrl);
    return apiBaseUrl.toString();
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

  async *customReports(
    customReportName: string,
    reportFormat: string | null
  ): AsyncGenerator<any> {
    const finalPathURL = ccxUrl(
      `/service/customreport2/${this.tenant}/${customReportName}`,
      this.baseUrl
    );
    const finalPath = finalPathURL.toString();
    this.logger.info(
      `Fetching Custom Report '${customReportName}' from - ${finalPath}`
    );

    if (!reportFormat) {
      reportFormat = 'json';
    }

    const res = await this.api.get(finalPath, {params: {format: reportFormat}});
    if (reportFormat === 'json') {
      for (const item of res.data?.Report_Entry ?? []) {
        yield item;
      }
    } else if (reportFormat === 'csv') {
      const parsedCsvByLines = Papa.parse(res.data, {
        header: true, // Treats first row as column names
        skipEmptyLines: true,
      });
      for (const item of parsedCsvByLines.data ?? []) {
        yield item;
      }
    } else {
      throw new VError(
        `Invalid report format '${reportFormat}' for custom report '${customReportName}'`
      );
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

export function ccxUrl(postCxxPath: string, baseUrl: string): string {
  const url = new URL('/ccx' + postCxxPath, baseUrl);
  return url.toString();
}
