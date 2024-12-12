import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import parseLinkHeader from 'parse-link-header';
import {VError} from 'verror';

import {Group, User, UserOfGroup} from './models';

const DEFAULT_VERSION = 'v1';
const DEFAULT_API_TIMEOUT_MS = 0; // 0 means no timeout
const DEFAULT_RETRIES = 3;
export interface OktaConfig {
  readonly token: string;
  readonly domain_name: string;
  readonly version?: string;
  readonly api_timeout?: number;
  readonly max_retries?: number;
}

export class Okta {
  private static okta: Okta = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: OktaConfig,
    logger: AirbyteLogger
  ): Promise<Okta> {
    if (Okta.okta) return Okta.okta;

    if (!config.token) {
      throw new VError('Please provide a token');
    }
    const version = config.version ?? DEFAULT_VERSION;
    const httpClient = makeAxiosInstanceWithRetry(
      {
        baseURL: `https://${config.domain_name}.okta.com/api/${version}/`,
        timeout: config.api_timeout ?? DEFAULT_API_TIMEOUT_MS,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          Authorization: `SSWS ${config.token}`,
        },
      },
      logger?.asPino(),
      config.max_retries ?? DEFAULT_RETRIES,
      10000
    );

    Okta.okta = new Okta(httpClient, logger);
    return Okta.okta;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getUsers(1);
      await iter.next();
    } catch (err: any) {
      throw new VError(
        `Connection check failed. Please verify your token is correct. Error: ${err.message}`
      );
    }
  }

  private async *paginate<T>(path: string, params = {}): AsyncGenerator<T> {
    let after = null;
    do {
      const finalParams = after ? {...params, after} : {...params};
      try {
        const res = await this.httpClient.get<T[]>(path, {params: finalParams});
        const linkHeader = parseLinkHeader(res.headers?.link);
        after = linkHeader?.next?.after;
        for (const item of res.data) {
          yield item;
        }
      } catch (err: any) {
        const w = wrapApiError(err);
        this.logger.error(
          `Failed requesting '${path}' with params ${JSON.stringify(
            finalParams
          )}. Error: ${w.message}`,
          w.stack
        );
        throw new VError(w.message);
      }
    } while (after);
  }

  async *getUsers(limit = 500): AsyncGenerator<User> {
    const filter = 'status eq "ACTIVE"';
    for await (const user of this.paginate<User>('users', {limit, filter})) {
      yield user;
    }
  }

  async *getGroups(limit = 500): AsyncGenerator<Group> {
    const filter = 'status eq "ACTIVE"';
    for await (const group of this.paginate<Group>('groups', {limit, filter})) {
      const usersOfGroup: string[] = [];
      for await (const user of this.paginate<UserOfGroup>(
        `groups/${group.id}/users`,
        {limit}
      )) {
        usersOfGroup.push(user.id);
      }
      group.usersOfGroup = usersOfGroup;
      yield group;
    }
  }
}
