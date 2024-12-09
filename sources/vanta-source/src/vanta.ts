import axios, {AxiosError, AxiosInstance, AxiosResponse} from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {
  Vulnerability,
  VulnerabilityRemediation,
  VulnerableAsset,
  VulnerableAssetSummary,
} from 'faros-airbyte-common/vanta';
import {makeAxiosInstanceWithRetry, wrapApiError} from 'faros-js-client';
import VError from 'verror';

import {VantaConfig} from '.';
import {getQueryFromName} from './utils';

const BASE_URL = 'https://api.vanta.com';
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_RETRIES = 8;
export const DEFAULT_CUTOFF_DAYS = 90;

const DEFAULT_RETRY_DELAY = 1000;
const DEFAULT_GATEWAY_TIMEOUT_DELAY = 30000;

/**
 * Vanta REST API client
 *
 */
export class Vanta {
  private static vanta: Vanta;
  private readonly vulnerableAssets = new Map<string, VulnerableAssetSummary>();

  constructor(
    private readonly api: AxiosInstance,
    private readonly limit: number,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    cfg: VantaConfig,
    logger: AirbyteLogger
  ): Promise<Vanta> {
    if (Vanta.vanta) return Vanta.vanta;

    const delayLogic = this.createDelayLogic(
      logger,
      cfg.gateway_timeout_retry_delay ?? DEFAULT_GATEWAY_TIMEOUT_DELAY
    );

    const api = makeAxiosInstanceWithRetry(
      {
        baseURL: BASE_URL,
        timeout: cfg.api_timeout ?? DEFAULT_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
        },
        maxContentLength: Infinity, //default is 2000 bytes
      },
      logger?.asPino(),
      cfg.api_max_retries ?? DEFAULT_MAX_RETRIES,
      delayLogic
    );

    if (!cfg.client_id || !cfg.client_secret) {
      throw new VError('Vanta client ID or secret missing.');
    }

    const refreshToken = async (): Promise<void> => {
      const token = await Vanta.getSessionToken(
        cfg.client_id,
        cfg.client_secret
      );
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    };
    createAuthRefreshInterceptor(api, refreshToken, {statusCodes: [401]});

    Vanta.vanta = new Vanta(api, cfg.page_size ?? DEFAULT_PAGE_LIMIT, logger);
    return Vanta.vanta;
  }

  static createDelayLogic(
    logger: AirbyteLogger,
    gatewayTimeoutDelay: number
  ): (error: AxiosError<unknown, any>, retryNumber: number) => number {
    return (error: AxiosError<unknown, any>, retryNumber: number): number => {
      const statusCode = error?.response?.status;
      const retries = retryNumber ? retryNumber - 1 : 0;
      if (statusCode === 429) {
        // Retrying using an exponential backoff as recommended in the API documentation, starting at 60 seconds.
        // https://developer.vanta.com/docs/faq#:~:text=What%20should%20I%20do%20if%20I%20hit%20the%20rate%20limit%3F
        const delay = 60 * DEFAULT_RETRY_DELAY * Math.pow(2, retries);
        logger.warn(
          `Received rate limit exceeded (429) error from Vanta API, retrying in ${
            delay / 1000
          } seconds.`
        );
        return delay;
      }

      if (statusCode === 500) {
        // Retrying using an exponential backoff, starting at 60 seconds.
        const delay = 60 * DEFAULT_RETRY_DELAY * Math.pow(2, retries);
        logger.warn(
          `Received internal server error (500), retrying in ${
            delay / 1000
          } seconds.`
        );
        return delay;
      }

      if (statusCode === 504) {
        logger.warn(
          `Received gateway timeout (504), retrying in ${gatewayTimeoutDelay / 1000} seconds.`
        );
        return gatewayTimeoutDelay;
      }
      logger.warn(
        `Retrying in ${DEFAULT_RETRY_DELAY} milliseconds using default delay.`
      );
      return DEFAULT_RETRY_DELAY;
    };
  }

  static async getSessionToken(
    clientId: string,
    clientSecret: string
  ): Promise<string> {
    const body = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'vanta-api.all:read',
    };
    try {
      const {data}: AxiosResponse = await axios.post(
        `${BASE_URL}/oauth/token`,
        body
      );
      return data.access_token;
    } catch (error: any) {
      throw wrapApiError(error, 'Failed to get authentication token');
    }
  }

  async checkConnection(): Promise<[boolean, VError]> {
    const query = getQueryFromName('Organization');
    const body = {
      query,
      variables: {},
    };
    try {
      const response = await this.api.post('/graphql', body);
      return [response.status === 200, undefined];
    } catch (error) {
      return [false, new VError(error, 'Connection check failed')];
    }
  }
  async *getVulnerabilities(
    slaDeadlineAfterDate: Date
  ): AsyncGenerator<Vulnerability> {
    const assetMap = await this.getVulnerableAssetsMap();

    for await (const vulnerability of this.paginate<Vulnerability>(
      this.fetchVulnerabilities.bind(this),
      slaDeadlineAfterDate
    )) {
      yield {
        ...vulnerability,
        asset: assetMap.get(vulnerability.targetId),
      };
    }
  }

  async *getVulnerabilityRemediations(
    remediatedAfter: Date
  ): AsyncGenerator<VulnerabilityRemediation> {
    const assetMap = await this.getVulnerableAssetsMap();

    for await (const remediation of this.paginate<VulnerabilityRemediation>(
      this.fetchVulnerabilityRemediations.bind(this),
      remediatedAfter
    )) {
      yield {
        ...remediation,
        asset: assetMap.get(remediation.vulnerableAssetId),
      };
    }
  }

  private async *paginate<T>(
    fetchFunction: (
      cursor: string | null,
      ...args: any[]
    ) => Promise<{
      data: T[];
      pageInfo: {endCursor: string | null; hasNextPage: boolean};
    }>,
    ...args: any[]
  ): AsyncGenerator<T> {
    let cursor: string | null = null;
    let hasNext = true;

    while (hasNext) {
      const {data, pageInfo} = await fetchFunction(cursor, ...args);

      for (const item of data) {
        yield item;
      }

      cursor = pageInfo.endCursor;
      hasNext = pageInfo.hasNextPage;
    }
  }

  private async fetchData<T>(
    endpoint: string,
    cursor: string | null,
    params: object,
    errorMessage: string
  ): Promise<{
    data: T[];
    pageInfo: {endCursor: string | null; hasNextPage: boolean};
  }> {
    const requestParams = {pageSize: this.limit, pageCursor: cursor, ...params};

    try {
      const response = await this.api.get(endpoint, {params: requestParams});
      return response?.data?.results;
    } catch (error: any) {
      throw wrapApiError(error, errorMessage);
    }
  }

  private async fetchVulnerabilities(
    cursor: string | null,
    slaDeadlineAfterDate: Date
  ): Promise<{
    data: Vulnerability[];
    pageInfo: {endCursor: string | null; hasNextPage: boolean};
  }> {
    return this.fetchData<Vulnerability>(
      '/v1/vulnerabilities',
      cursor,
      {slaDeadlineAfterDate},
      'Failed to fetch vulnerabilities'
    );
  }

  private async fetchVulnerabilityRemediations(
    cursor: string | null,
    remediatedAfter: Date
  ): Promise<{
    data: VulnerabilityRemediation[];
    pageInfo: {endCursor: string | null; hasNextPage: boolean};
  }> {
    return this.fetchData<VulnerabilityRemediation>(
      '/v1/vulnerability-remediations',
      cursor,
      {remediatedAfter},
      'Failed to fetch vulnerability remediations'
    );
  }

  private async fetchVulnerableAssets(cursor: string | null): Promise<{
    data: VulnerableAsset[];
    pageInfo: {endCursor: string | null; hasNextPage: boolean};
  }> {
    return this.fetchData<VulnerableAsset>(
      '/v1/vulnerable-assets',
      cursor,
      {},
      'Failed to fetch vulnerable assets'
    );
  }

  /** Fetches all vulnerable assets and builds a map of asset ID to asset data
   *  for linking to vulnerabilities and remediations **/
  private async getVulnerableAssetsMap(): Promise<
    Map<string, VulnerableAssetSummary>
  > {
    if (this.vulnerableAssets.size > 0) return this.vulnerableAssets;

    for await (const asset of this.paginate<VulnerableAsset>(
      this.fetchVulnerableAssets.bind(this)
    )) {
      const imageTags = asset.scanners.flatMap(
        (scanner: any) => scanner.imageTags ?? []
      );
      this.vulnerableAssets.set(asset.id, {
        name: asset.name,
        type: asset.assetType,
        imageTags,
      });
    }

    return this.vulnerableAssets;
  }
}
