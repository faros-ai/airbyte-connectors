import {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import fs from 'fs';
import path from 'path';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {Finding, TromzoConfig} from './types';

export class Tromzo {
  private static readonly tromzo: Tromzo;
  constructor(
    private readonly api: AxiosInstance,
    private readonly limit: number = 100,
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

    const baseURL = `https://${organization}.tromzo.com/api/`;
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
    await this.tools();
  }

  private static readQueryFile(fileName: string): string {
    return fs.readFileSync(
      path.join(__dirname, '..', 'resources', 'queries', fileName),
      'utf8'
    );
  }

  @Memoize()
  async tools(): Promise<string[]> {
    const query = Tromzo.readQueryFile('tool-names.gql');
    try {
      const response = await this.api.post('', {query});
      const tools = response.data?.data?.findings?.toolNames;
      if (!tools?.length) {
        throw new VError('No configured tools found');
      }
      return tools;
    } catch (err) {
      throw new VError(err, 'Failed to fetch tools from Tromzo');
    }
  }

  async *findings(toolName: string, startDate: Date): AsyncGenerator<Finding> {
    const query = Tromzo.readQueryFile('findings.gql');
    let offset = 0;
    let count = 0;
    let totalObjects = 0;

    const q =
      // Tromzo doesn't support db_updated_at for GitHub services, so will fetch all findings
      toolName.toLowerCase().startsWith('github')
        ? `tool_name in ("${toolName}")`
        : `tool_name in ("${toolName}") and db_updated_at >= "${startDate.toISOString()}"`;

    do {
      const variables = {
        offset,
        first: this.limit,
        q,
      };
      let response;

      try {
        response = await this.api.post('', {query, variables});
      } catch (err) {
        throw new VError(err, 'Failed to fetch findings from Tromzo');
      }

      const findings = response.data?.data?.findings;
      const edges = findings?.edges;
      if (!edges?.length) {
        break;
      }

      for (const edge of edges) {
        yield edge.node;
        count++;
      }

      totalObjects = findings?.pageInfo?.totalObjects;
      this.logger?.debug(
        `Fetched ${count} records of ${totalObjects} total findings`
      );

      offset += this.limit;
    } while (offset < totalObjects);
  }
}
