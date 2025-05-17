import {Gitlab as GitlabClient} from '@gitbeaker/rest';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {GitLabConfig} from './types';

export class GitLabToken {
  constructor(
    readonly config: GitLabConfig,
    readonly client: any,
    readonly logger: AirbyteLogger
  ) {}

  static instance(
    config: GitLabConfig,
    logger: AirbyteLogger
  ): Promise<GitLabToken> {
    return Promise.resolve(
      new GitLabToken(
        config,
        new GitlabClient({
          token: config.authentication.personal_access_token,
          host: config.url || 'https://gitlab.com/api/v4',
          rejectUnauthorized: config.reject_unauthorized ?? true,
        }),
        logger
      )
    );
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.Version.show();
    } catch (err: any) {
      throw new VError(
        `Connection check failed. Please verify your credentials. Error: ${err.message}`
      );
    }
  }
}

export class GitLab {
  private static gitlab: GitLabToken;

  static async instance(
    config: GitLabConfig,
    logger: AirbyteLogger
  ): Promise<GitLab> {
    if (!GitLab.gitlab) {
      GitLab.gitlab = await GitLabToken.instance(config, logger);
    }
    return new GitLab(GitLab.gitlab);
  }

  constructor(private readonly client: GitLabToken) {}

  @Memoize()
  async getGroup(path: string): Promise<any> {
    try {
      return await this.client.client.Groups.show(path);
    } catch (err: any) {
      throw new VError(
        `Failed to retrieve group ${path}: ${err.message}`
      );
    }
  }

  @Memoize()
  async getAllGroups(): Promise<any[]> {
    try {
      const config = this.client.config;
      if (config.groups && config.groups.length > 0) {
        const groups = [];
        for (const group of config.groups) {
          groups.push(await this.getGroup(group));
        }
        return groups;
      }

      const res = await this.client.client.Groups.all({
        minAccessLevel: 10, // Guest
        topLevelOnly: true,
      });

      if (config.excluded_groups && config.excluded_groups.length > 0) {
        return res.filter(
          (group) => !config.excluded_groups.includes(group.path)
        );
      }

      return res;
    } catch (err: any) {
      throw new VError(
        `Failed to retrieve groups: ${err.message}`
      );
    }
  }
}
