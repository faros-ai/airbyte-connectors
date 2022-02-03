import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {wrapApiError} from 'faros-feeds-sdk';
import {VError} from 'verror';

import {Group, GroupOfUser, User, UserOfGroup} from './models';

const DEFAULT_VERSION = 'v1';

export interface OktaConfig {
  readonly token: string;
  readonly domain_name: string;
  readonly version?: string;
}

export class Okta {
  private static okta: Okta = null;

  constructor(private readonly httpClient: AxiosInstance) {}

  static async init(config: OktaConfig): Promise<Okta> {
    if (!config.token) {
      throw new VError('token must be a not empty string');
    }
    const version = config.version ? config.version : DEFAULT_VERSION;
    const httpClient = axios.create({
      baseURL: `https://${config.domain_name}.okta.com/api/${version}/`,
      timeout: 10000, // default is `0` (no timeout)
      maxContentLength: 50000, //default is 2000 bytes
      headers: {
        Authorization: `SSWS ${config.token}`,
      },
    });

    Okta.okta = new Okta(httpClient);
    return Okta.okta;
  }

  static async instance(): Promise<Okta> {
    return Okta.okta;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getUsers();
      await iter.next();
    } catch (err: any) {
      let errorMessage = 'Please verify your token is correct. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  async *getUsers(): AsyncGenerator<User> {
    const res = await this.httpClient.get<User[]>('users');
    for (const item of res.data) {
      const resItem = await this.httpClient.get<GroupOfUser[]>(
        `users/${item.id}/groups`
      );
      item.groupsOfUser = resItem.data;
      yield item;
    }
  }

  async *getGroups(): AsyncGenerator<Group> {
    const res = await this.httpClient.get<Group[]>('groups');
    for (const item of res.data) {
      const resItem = await this.httpClient.get<UserOfGroup[]>(
        `groups/${item.id}/users`
      );
      item.usersOfGroup = resItem.data;
      yield item;
    }
  }
}
