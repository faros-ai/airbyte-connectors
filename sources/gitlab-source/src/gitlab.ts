import {Gitlab as GitlabClient} from '@gitbeaker/node';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {validateBucketingConfig} from 'faros-airbyte-common/common';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {RunMode} from './streams/common';
import {GitLabConfig, GitLabToken, Group, Project} from './types';

export const DEFAULT_GITLAB_API_URL = 'https://gitlab.com';
export const DEFAULT_REJECT_UNAUTHORIZED = true;
export const DEFAULT_RUN_MODE = RunMode.Full;
export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_BACKFILL = false;
export const DEFAULT_FETCH_PUBLIC_GROUPS = false;
export const DEFAULT_FAROS_API_URL = 'https://prod.api.faros.ai';
export const DEFAULT_FAROS_GRAPH = 'default';

export class GitLab {
  private static gitlab: GitLab;
  private readonly client: any;
  protected readonly pageSize: number;
  protected readonly fetchPublicGroups: boolean;

  constructor(
    readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger
  ) {
    this.client = new GitlabClient({
      token: this.getToken(),
      host: this.getBaseUrl(),
      rejectUnauthorized:
        config.reject_unauthorized ?? DEFAULT_REJECT_UNAUTHORIZED,
    });

    this.pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    this.fetchPublicGroups =
      config.fetch_public_groups ?? DEFAULT_FETCH_PUBLIC_GROUPS;
  }

  static async instance(
    cfg: GitLabConfig,
    logger: AirbyteLogger
  ): Promise<GitLab> {
    if (GitLab.gitlab) {
      return GitLab.gitlab;
    }
    validateBucketingConfig(cfg, logger.info.bind(logger));

    const gitlab = new GitLab(cfg, logger);
    await gitlab.checkConnection();
    GitLab.gitlab = gitlab;
    return gitlab;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.Version.show();
    } catch (err: any) {
      throw new VError(err, 'Failed to connect to GitLab API');
    }
  }

  async *getGroupsIterator(): AsyncGenerator<string> {
    try {
      const options = {
        perPage: this.pageSize,
        withProjects: false,
        allAvailable: this.fetchPublicGroups,
        topLevelOnly: true,
      };

      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const groups = await this.client.Groups.all({...options, page});

        if (!groups || groups.length === 0) {
          hasMore = false;
          continue;
        }

        for (const group of groups) {
          yield group.path;
        }

        page++;
      }
    } catch (err: any) {
      this.logger.error(`Failed to fetch groups: ${err.message}`);
      throw new VError(err, 'Error fetching groups');
    }
  }

  @Memoize()
  async getGroup(groupPath: string): Promise<Group> {
    try {
      const group = await this.client.Groups.show(groupPath);

      return {
        id: group.id.toString(),
        name: group.name,
        path: group.path,
        web_url: group.web_url,
        description: group.description,
        visibility: group.visibility,
        created_at: group.created_at,
        updated_at: group.updated_at,
      };
    } catch (err: any) {
      this.logger.error(`Failed to fetch group ${groupPath}: ${err.message}`);
      throw new VError(err, `Error fetching group ${groupPath}`);
    }
  }

  async getProjects(groupPath: string): Promise<Project[]> {
    try {
      const options = {
        perPage: this.pageSize,
        includeSubgroups: true,
      };

      const projects: Project[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const groupProjects = await this.client.Groups.projects(groupPath, {...options, page});

        if (!groupProjects || groupProjects.length === 0) {
          hasMore = false;
          continue;
        }

        for (const project of groupProjects) {
          projects.push({
            id: project.id.toString(),
            name: project.name,
            path: project.path,
            path_with_namespace: project.path_with_namespace,
            web_url: project.web_url,
            description: project.description,
            visibility: project.visibility,
            created_at: project.created_at,
            updated_at: project.updated_at,
            namespace: {
              id: project.namespace.id.toString(),
              name: project.namespace.name,
              path: project.namespace.path,
              kind: project.namespace.kind,
              full_path: project.namespace.full_path,
            },
          });
        }

        page++;
      }

      return projects;
    } catch (err: any) {
      this.logger.error(`Failed to fetch projects for group ${groupPath}: ${err.message}`);
      throw new VError(err, `Error fetching projects for group ${groupPath}`);
    }
  }

  private getToken(): string {
    const auth = this.getAuth();
    if (auth.type !== 'token') {
      throw new VError('Only token authentication is supported');
    }
    return auth.personal_access_token;
  }

  private getAuth(): GitLabToken {
    if (!this.config.authentication) {
      throw new VError('Authentication configuration is required');
    }
    return this.config.authentication;
  }

  private getBaseUrl(): string {
    return this.config.url ?? DEFAULT_GITLAB_API_URL;
  }
}
