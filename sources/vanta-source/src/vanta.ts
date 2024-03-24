import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {VantaConfig} from '.';
import {queryTypeToQuery} from './types';

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
    private readonly tenant: string,
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
      cfg.tenant,
      cfg.skipConnectionCheck ? cfg.skipConnectionCheck : true
    );
  }

  async *vulns(queryType: string): AsyncGenerator<any> {
    const query = queryTypeToQuery[queryType];
    if (!query) {
      throw new VError('Unknown query type: %s', queryType);
    }
    const res = await this.api.get(finalPath, {params: {format: 'json'}});
    for (const item of res.data?.Report_Entry ?? []) {
      yield item;
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
