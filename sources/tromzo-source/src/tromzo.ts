import {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import fs from 'fs';
import path from 'path';
import VError from 'verror';

import {Finding, TromzoConfig} from './types';

export class Tromzo {
  private static tromzo: Tromzo;
  constructor(
    private readonly api: AxiosInstance,
    private limit: number = 100,
    private readonly logger?: AirbyteLogger
  ) {}

  static async instance(
    config: TromzoConfig,
    logger: AirbyteLogger
  ): Promise<Tromzo> {
    if (Tromzo.tromzo) return Tromzo.tromzo;

    const apiKey = config.api_key?.trim();
    if (!apiKey) {
      throw new VError('Please provide a valid Tromzo API key');
    }
    const organization = config.organization?.trim();
    if (!organization) {
      throw new VError('Please provide a valid Tromzo organization');
    }

    const baseURL = `https://${organization}.tromzo.com/api`;
    const api = makeAxiosInstanceWithRetry(
      {
        baseURL,
        timeout: config.api_timeout ?? 0, // 0 means no timeout
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        maxContentLength: Infinity, //default is 2000 bytes
      },
      logger?.asPino(),
      config.api_max_retries
    );

    return new Tromzo(api, config.api_page_size, logger);
  }

  async checkConnection(): Promise<void> {
    return;
  }

  private static readQueryFile(fileName: string): string {
    return fs.readFileSync(
      path.join(__dirname, '..', 'resources', 'queries', fileName),
      'utf8'
    );
  }

  async *findings(tool: string): AsyncGenerator<Finding> {
    const gqlQuery = Tromzo.readQueryFile('findings.gql');
    const query = `tool_name in ("${tool}")`;
    let offset = 0;
    let count = 0;
    let totalObjects = 0;

    do {
      const variables = {
        offset,
        first: this.limit,
        q: query,
      };
      let response;
      try {
        response = await this.api.post('/graphql', {
          query: gqlQuery,
          variables,
        });
      } catch (err) {
        throw new VError(err, 'Failed to fetch findings from Tromzo');
      }
      const findings = response.data?.data?.findings;
      const edges = findings?.edges;
      if (!edges || !edges.length) {
        break;
      }

      for (const edge of edges) {
        yield edge.node;
        count++;
      }

      totalObjects = findings?.pageInfo?.totalObjects;
      this.logger?.debug(`Fetched ${count} records of ${totalObjects}`);

      offset += this.limit;
    } while (offset < totalObjects);
  }
}
