import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk/lib';
import {wrapApiError} from 'faros-feeds-sdk';
import parseLinkHeader from 'parse-link-header';
import {VError} from 'verror';

import {Group, User, UserOfGroup} from './models';

const DEFAULT_VERSION = 'v1';

export interface OktaConfig {
  readonly token: string;
  readonly domain_name: string;
  readonly version?: string;
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
      throw new VError('Token must be a not empty string');
    }
    const version = config.version ?? DEFAULT_VERSION;
    const httpClient = axios.create({
      baseURL: `https://${config.domain_name}.okta.com/api/${version}/`,
      timeout: 60000, // default is `0` (no timeout)
      // Okta responses can be are very large hence the infinity
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        Authorization: `SSWS ${config.token}`,
      },
    });

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
        const errorMessage = wrapApiError(err).message;
        this.logger.error(
          `Failed requesting '${path}' with params ${JSON.stringify(
            finalParams
          )}. Error: ${errorMessage}`
        );
        throw new VError(errorMessage);
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
