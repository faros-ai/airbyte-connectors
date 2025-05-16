import {AirbyteLogger} from 'faros-airbyte-cdk';
import {Gitlab} from '@gitbeaker/rest';
import VError from 'verror';

import {GitLabConfig, Group} from './types';

export const DEFAULT_API_URL = 'https://gitlab.com';
export const DEFAULT_API_VERSION = '4';
export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_REJECT_UNAUTHORIZED = true;

export class GitLab {
  private static gitlab: GitLab;

  constructor(
    private readonly client: any,
    private readonly config: GitLabConfig,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: GitLabConfig,
    logger: AirbyteLogger
  ): Promise<GitLab> {
    if (GitLab.gitlab) {
      return GitLab.gitlab;
    }

    const apiUrl = config.url ?? DEFAULT_API_URL;
    const token = config.authentication?.token ?? config.token;

    const client = new Gitlab({
      host: apiUrl,
      token: token as any,
      rejectUnauthorized: config.reject_unauthorized ?? DEFAULT_REJECT_UNAUTHORIZED,
    });

    try {
      await (client.Users as any).current();
    } catch (err: any) {
      throw new VError(
        err,
        `Failed to connect to GitLab API at ${apiUrl}. Error: ${err.message}`
      );
    }

    GitLab.gitlab = new GitLab(client, config, logger);
    return GitLab.gitlab;
  }

  async getGroup(groupId: string): Promise<Group> {
    try {
      const group = await this.client.Groups.show(groupId);
      return group as Group;
    } catch (err: any) {
      throw new VError(
        err,
        `Failed to get group ${groupId}. Error: ${err.message}`
      );
    }
  }

  async *listGroups(): AsyncGenerator<Group> {
    try {
      const pageSize = this.config.page_size ?? DEFAULT_PAGE_SIZE;
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const groups = await this.client.Groups.all({
          perPage: pageSize,
          page: page,
        });

        if (groups.length === 0) {
          hasMore = false;
        } else {
          for (const group of groups) {
            yield group as Group;
          }
          page++;
        }
      }
    } catch (err: any) {
      throw new VError(err, `Failed to list groups. Error: ${err.message}`);
    }
  }
}
