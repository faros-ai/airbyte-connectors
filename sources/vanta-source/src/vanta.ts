import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {VantaConfig} from '.';
import {QueryHolder, queryTypeToQueryHolder} from './types';

const DEFAULT_PAGE_LIMIT = 100;

export interface Page<T> {
  data: ReadonlyArray<T>;
  total: number;
}

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
    private readonly skipConnectionCheck: boolean
  ) {}

  static async instance(
    cfg: VantaConfig,
    logger: AirbyteLogger
  ): Promise<Vanta> {
    if (!cfg.token) {
      throw new VError('Vanta token missing.');
    }
    if (!cfg.apiUrl) {
      throw new VError('apiUrl missing.');
    }

    // Checks apiUrl is in the correct format
    const apiUrl = new URL(cfg.apiUrl);
    const timeout = cfg.timeout ?? 60000;
    const headers = {
      'content-type': 'application/json',
      Authorization: `token ${cfg.token}`,
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
      cfg.limit ?? DEFAULT_PAGE_LIMIT,
      apiUrl.toString(),
      cfg.skipConnectionCheck ? cfg.skipConnectionCheck : true
    );
  }

  async *vulns(queryType: string): AsyncGenerator<any> {
    const queryHolder: QueryHolder = queryTypeToQueryHolder[queryType];
    if (!queryHolder) {
      throw new VError('Unknown query type: %s', queryType);
    }
    const res = await this.paginate(queryHolder);
    for (const item of res) {
      yield item;
    }
  }

  async getAxiosResponse(url: string, body: any): Promise<AxiosResponse> {
    try {
      const packed_response: AxiosResponse = await this.api.post(url, body);
      return packed_response;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`Axios error occurred: ${error.message}`);
        if (error.response) {
          this.logger.error(
            `Server responded with status ${error.response.status}`
          );
        } else if (error.request) {
          this.logger.error(`No response received for the request`);
        } else {
          this.logger.error(`Error setting up the request: ${error.message}`);
        }
      } else {
        this.logger.error(
          `Non-Axios error occurred: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    }
  }

  private async paginate(queryHolder: QueryHolder): Promise<any[]> {
    const store: any[] = [];
    let cursor = null;
    // Eventual queries will have cursor as a string
    const variables = {last: this.limit, before: cursor};
    let body = {
      query: queryHolder.query,
      variables,
    };
    let continueLoop = true;
    let nPages = 0;
    this.logger.info('Starting pagination with query: %s', queryHolder.query);
    while (continueLoop) {
      // Assuming vanta_client is an instance of Axios or similar
      this.logger.info(`Running query with page ${nPages++}`);
      const packed_response: AxiosResponse = await this.getAxiosResponse(
        this.apiUrl,
        body
      );
      const response = packed_response?.data;
      const newEdges =
        response?.data?.organization?.[queryHolder.objectName]?.edges;
      const newNodes = newEdges?.map((edge: any) => edge.node);
      if (newNodes) {
        store.push(...newNodes);
      }
      this.logger.debug(`Number of new edges: ${newEdges.length}`);

      // Preparing for next cycle
      if (newEdges.length < this.limit) {
        continueLoop = false;
      }
      if (newEdges.length > 0) {
        cursor = newEdges[0].cursor;
        if (!cursor) {
          throw new Error(
            'Cursor is missing from query result: ' +
              JSON.stringify(newEdges[0])
          );
        }
        variables['before'] = cursor;
        body = {
          query: queryHolder.query,
          variables,
        };
      }
    }
    return store;
  }
}
