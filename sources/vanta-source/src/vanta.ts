import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
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
    console.log(`res: ${res}`);
    for (const item of res) {
      yield item;
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
      const packed_response = await this.api.post(this.apiUrl, body);
      const response = packed_response?.data;
      const newEdges =
        response?.data?.organization?.[queryHolder.objectName]?.edges;
      const newNodes = newEdges?.map((edge: any) => edge.node);
      store.push(...newNodes); // Assuming 'store' is an array that has been defined earlier
      this.logger.debug(`Number of new edges: ${newEdges.length}`);
      if (newEdges.length < this.limit) {
        continueLoop = false;
      }
      cursor = newEdges[0].cursor;
      if (!cursor) {
        throw new Error(
          'Cursor is missing from query result: ' + JSON.stringify(newEdges[0])
        );
      }
      variables['before'] = cursor;
      body = {
        query: queryHolder.query,
        variables,
      };
    }
    return store;
  }
}
