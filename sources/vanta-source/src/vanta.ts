import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import VError from 'verror';

import {VantaConfig} from '.';
import {getQueryFromName} from './utils';

const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_TIMEOUT = 60000;

/**
 * Vanta REST API client
 *
 */
export class Vanta {
  constructor(
    private readonly logger: AirbyteLogger,
    private readonly api: AxiosInstance,
    private readonly limit: number,
    private readonly apiUrl: string,
    private readonly skipConnectionCheck: boolean,
    private readonly resourceIdToName: Map<string, string>
  ) {}

  static async instance(
    cfg: VantaConfig,
    logger: AirbyteLogger
  ): Promise<Vanta> {
    if (!cfg.client_id || !cfg.client_secret) {
      throw new VError('Vanta client ID or secret missing.');
    }
    if (!cfg.apiUrl) {
      throw new VError('apiUrl missing.');
    }

    // Checks apiUrl is in the correct format
    const apiUrl = new URL(cfg.apiUrl);

    const timeout: number = cfg.timeout ?? DEFAULT_TIMEOUT;

    const sessionToken: string = await Vanta.getSessionToken(
      apiUrl.toString(),
      cfg.client_id,
      cfg.client_secret,
      timeout
    );

    const headers = {
      'content-type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
      Accept: '*/*',
    };

    const api = axios.create({
      timeout, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes,
      maxBodyLength: Infinity, //default is 2000 bytes,
      headers,
    });

    return new Vanta(
      logger,
      api,
      cfg.page_size ?? DEFAULT_PAGE_LIMIT,
      apiUrl.toString(),
      cfg.skip_connection_check ?? true,
      cfg.resourceIdToNameMap
    );
  }

  static async getSessionToken(
    apiUrl: string,
    clientId: string,
    clientSecret: string,
    timeout: number
  ): Promise<string> {
    // The expectation is that this token will last long enough to complete the connector.
    // If that is not the case, we will need to update the connector to match the requirements

    const headers = {
      'content-type': 'application/json',
    };
    const api = axios.create({
      timeout, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes,
      maxBodyLength: Infinity, //default is 2000 bytes,
      headers,
    });
    const tokenUrl = `${apiUrl}oauth/token`;
    const body = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'vanta-api.all:read',
    };
    try {
      const packed_response: AxiosResponse = await api.post(tokenUrl, body, {
        headers,
      });
      return packed_response.data.access_token;
    } catch (error) {
      throw new VError('Failed to fetch session token: %s', error);
    }
  }

  async checkConnection(): Promise<[boolean, VError]> {
    const query = getQueryFromName('Organization');
    const body = {
      query,
      variables: {},
    };
    try {
      const packed_response: AxiosResponse = await this.getAxiosResponse(
        this.apiUrl + '/graphql',
        body
      );
      return [packed_response.status === 200, undefined];
    } catch (error) {
      return [false, new VError(error, 'Connection check failed')];
    }
  }
  async *getVulnerabilities(): AsyncGenerator<any> {
    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const {data, pageInfo} = await this.fetchVulnerabilities(cursor);

      for (const vulnerability of data) {
        const resourceId = vulnerability.targetId;
        const resource = this.getResourceName(resourceId);
        yield {...vulnerability, resource};
      }

      cursor = pageInfo.endCursor;
      hasNext = pageInfo.hasNextPage;
    }
  }

  async *getVulnerabilityRemediations(): AsyncGenerator<any> {
    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const {data, pageInfo} =
        await this.fetchVulnerabilityRemediations(cursor);

      for (const vulnerability of data) {
        yield vulnerability;
      }

      cursor = pageInfo.endCursor;
      hasNext = pageInfo.hasNextPage;
    }
  }

  private async fetchVulnerabilities(cursor: string | null): Promise<any> {
    const url = `${this.apiUrl}v1/vulnerabilities`;
    const params = {pageSize: this.limit, pageCursor: cursor};

    try {
      const response: AxiosResponse = await this.api.get(url, {params});
      return response?.data?.results;
    } catch (error) {
      throw new VError('Failed to fetch vulnerabilities: %s', error);
    }
  }

  private async fetchVulnerabilityRemediations(
    cursor: string | null
  ): Promise<any> {
    const url = `${this.apiUrl}v1/vulnerability-remediations`;
    const params = {pageSize: this.limit, pageCursor: cursor};

    try {
      const response: AxiosResponse = await this.api.get(url, {params});
      return response?.data?.results;
    } catch (error) {
      throw new VError('Failed to fetch vulnerability remediations: %s', error);
    }
  }

  // Method to fetch all integrations
  private async fetchIntegrations(): Promise<any[]> {
    const url = `${this.apiUrl}v1/integrations`;
    try {
      const response: AxiosResponse = await this.api.get(url);
      return response.data.results;
    } catch (error) {
      throw new VError('Failed to fetch integrations: %s', error);
    }
  }

  // Method to fetch all resource kinds for a specific integration
  private async fetchResourceKinds(integrationId: string): Promise<any[]> {
    const url = `${this.apiUrl}v1/integrations/${integrationId}/resource-kinds`;
    try {
      const response: AxiosResponse = await this.api.get(url);
      return response.data.results;
    } catch (error) {
      throw new VError(
        `Failed to fetch resource kinds for integration ${integrationId}: %s`,
        error
      );
    }
  }

  // Method to fetch all resources for a specific integration and resource kind
  private async fetchResources(
    integrationId: string,
    resourceKind: string,
    cursor: string | null = null
  ): Promise<any> {
    const url = `${this.apiUrl}v1/integrations/${integrationId}/resource-kinds/${resourceKind}/resources`;
    const params = {pageSize: this.limit, pageCursor: cursor};
    try {
      const response: AxiosResponse = await this.api.get(url, {params});
      return response.data;
    } catch (error) {
      throw new VError(
        `Failed to fetch resources for integration ${integrationId} and kind ${resourceKind}: %s`,
        error
      );
    }
  }

  // Method to fetch all resources across all integrations and kinds
  async getAllResources(): Promise<Map<string, any>> {
    const allResources = new Map<string, any>();

    try {
      // Step 1: Fetch all integrations
      const integrations = await this.fetchIntegrations();

      // Step 2: Iterate over each integration
      for (const integration of integrations) {
        const integrationId = integration.id;

        // Step 3: Fetch resource kinds for each integration
        const resourceKinds = await this.fetchResourceKinds(integrationId);

        // Step 4: For each resource kind, fetch resources
        for (const kind of resourceKinds) {
          let cursor = null;
          let hasNext = true;

          while (hasNext) {
            const {results, pageInfo} = await this.fetchResources(
              integrationId,
              kind.id,
              cursor
            );

            // Store each resource in the map by its ID for quick lookup
            for (const resource of results) {
              allResources.set(resource.id, resource);
            }

            cursor = pageInfo.endCursor;
            hasNext = pageInfo.hasNextPage;
          }
        }
      }

      return allResources;
    } catch (error) {
      throw new VError('Failed to fetch all resources: %s', error);
    }
  }

  private getResourceName(resourceId: string): string {
    return this.resourceIdToName.get(resourceId);
  }

  async getAxiosResponse(
    url: string,
    body: any,
    requestCount: number = 0
  ): Promise<AxiosResponse> {
    if (requestCount > 5) {
      throw new VError('Too many retries for Vanta API');
    }
    try {
      const packed_response: AxiosResponse = await this.api.post(url, body);
      return packed_response;
    } catch (error) {
      if (error instanceof Error && error.message?.includes('504')) {
        // Sleep for 30 seconds and continue:
        this.logger.info(
          'Got 504 from Vanta API, sleeping for 30 seconds, then retrying. Retry count: %s',
          (requestCount + 1).toString()
        );
        await new Promise((resolve) => setTimeout(resolve, 30000));
        return await this.getAxiosResponse(url, body, requestCount + 1);
      }
      this.logger.error(
        `Error occurred: ${error instanceof Error ? error.message : error}`
      );
      throw new VError(
        'Error occurred while fetching data from Vanta API: %s',
        error
      );
    }
  }
}
