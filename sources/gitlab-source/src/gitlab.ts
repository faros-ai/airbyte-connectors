import {Gitlab as GitlabClient, Types} from '@gitbeaker/node';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {validateBucketingConfig} from 'faros-airbyte-common/common';
import {
  Commit,
  GitLabToken,
  Group,
  Project,
  Tag,
  User,
} from 'faros-airbyte-common/gitlab';
import {toLower} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {RunMode} from './streams/common';
import {GitLabConfig} from './types';

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
      this.logger.debug(
        'Verifying GitLab credentials by fetching version info'
      );
      const versionInfo = await this.client.Version.show();
      if (versionInfo && typeof versionInfo === 'object') {
        this.logger.debug('GitLab credentials verified.', versionInfo);
      } else {
        this.logger.error(
          'GitLab version info response was not an object or was null: %s',
          JSON.stringify(versionInfo)
        );
        throw new VError(
          'GitLab authentication failed. Please check your GitLab instance is reachable and your API token is valid'
        );
      }
    } catch (err: any) {
      this.logger.error('Failed to fetch GitLab version: %s', err.message);
      throw new VError(
        err,
        'GitLab authentication failed. Please check your API token and permissions'
      );
    }
  }

  @Memoize()
  async getGroups(): Promise<Group[]> {
    const options = {
      perPage: this.pageSize,
      withProjects: false,
      allAvailable: this.fetchPublicGroups,
    };

    const fetchPage = (page: number): Promise<Types.GroupSchema[]> =>
      this.client.Groups.all({...options, page});

    const groups: Group[] = [];
    for await (const group of this.paginate<Types.GroupSchema>(
      fetchPage,
      'groups'
    )) {
      groups.push(GitLab.convertGitLabGroup(group));
    }

    return groups;
  }

  static convertGitLabGroup(group: any): Group {
    return {
      id: toLower(`${group.id}`),
      parent_id: group.parent_id ? toLower(`${group.parent_id}`) : null,
      name: group.name,
      path: group.path,
      web_url: group.web_url,
      description: group.description,
      visibility: group.visibility,
      created_at: group.created_at,
      updated_at: group.updated_at,
    };
  }

  @Memoize()
  async getGroup(groupId: string): Promise<Group> {
    try {
      const group = await this.client.Groups.show(groupId);
      return GitLab.convertGitLabGroup(group);
    } catch (err: any) {
      this.logger.error(`Failed to fetch group ${groupId}: ${err.message}`);
      throw new VError(err, `Error fetching group ${groupId}`);
    }
  }

  async getProjects(groupId: string): Promise<Project[]> {
    const options = {
      perPage: this.pageSize,
    };

    const fetchPage = (page: number): Promise<Types.ProjectSchema[]> =>
      this.client.Groups.projects(groupId, {...options, page});

    const projects: Project[] = [];
    for await (const project of this.paginate<Types.ProjectSchema>(
      fetchPage,
      `projects for group ${groupId}`
    )) {
      projects.push({
        id: toLower(`${project.id}`),
        name: project.name,
        path: project.path,
        path_with_namespace: project.path_with_namespace,
        web_url: project.web_url,
        description: project.description,
        visibility: project.visibility as string,
        created_at: project.created_at,
        updated_at: project.updated_at as string,
        namespace: {
          id: toLower(`${project.namespace.id}`),
          name: project.namespace.name,
          path: project.namespace.path,
          kind: project.namespace.kind,
          full_path: project.namespace.full_path,
        },
        default_branch: project.default_branch,
        archived: project.archived as boolean,
        group_id: groupId,
      });
    }

    return projects;
  }

  async getGroupMembers(groupId: string): Promise<User[]> {
    const options = {
      perPage: this.pageSize,
      includeInherited: true,
    };

    const fetchPage = (page: number): Promise<Types.MemberSchema[]> =>
      this.client.GroupMembers.all(groupId, {...options, page});

    const members: User[] = [];
    for await (const member of this.paginate<Types.MemberSchema>(
      fetchPage,
      `members for group ${groupId}`
    )) {
      members.push({
        id: member.id,
        username: member.username,
        name: member.name,
        email: (member.public_email || member.email) as string,
        state: member.state,
        web_url: member.web_url,
        created_at: member.created_at as string,
        updated_at: member.updated_at as string,
      });
    }

    return members;
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

  private async *paginate<T>(
    fetchPage: (page: number) => Promise<T[]>,
    entity: string
  ): AsyncGenerator<T> {
    try {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const items = await fetchPage(page);

        if (!items || items.length === 0) {
          hasMore = false;
          continue;
        }

        for (const item of items) {
          yield item;
        }

        page++;
      }
    } catch (err: any) {
      this.logger.error(`Failed to fetch ${entity}: ${err.message}`);
      throw new VError(err, `Error fetching ${entity}`);
    }
  }

  async *getCommits(
    projectPath: string,
    branch: string,
    since?: Date,
    until?: Date
  ): AsyncGenerator<Omit<Commit, 'group_id' | 'project_path'>> {
    const options: any = {
      refName: branch,
      perPage: this.pageSize,
    };

    if (since) {
      options.since = since.toISOString();
    }

    if (until) {
      options.until = until.toISOString();
    }

    const fetchPage = (page: number): Promise<Types.CommitSchema[]> =>
      this.client.Commits.all(projectPath, {...options, page});

    for await (const commit of this.paginate<Types.CommitSchema>(
      fetchPage,
      `commits for project ${projectPath}`
    )) {
      yield {
        id: commit.id,
        short_id: commit.short_id,
        created_at:
          commit.created_at instanceof Date
            ? commit.created_at.toISOString()
            : commit.created_at,
        parent_ids: commit.parent_ids ?? [],
        title: commit.title,
        message: commit.message,
        author_name: commit.author_name,
        author_email: commit.author_email,
        authored_date:
          commit.authored_date instanceof Date
            ? commit.authored_date.toISOString()
            : commit.authored_date,
        committer_name: commit.committer_name,
        committer_email: commit.committer_email,
        committed_date:
          commit.committed_date instanceof Date
            ? commit.committed_date.toISOString()
            : commit.committed_date,
        web_url: commit.web_url,
        branch: branch,
      };
    }
  }

  async *getTags(
    projectId: string
  ): AsyncGenerator<Omit<Tag, 'group_id' | 'project_path'>> {
    const options: Types.PaginatedRequestOptions = {
      perPage: this.pageSize,
    };

    const fetchPage = (page: number): Promise<Types.TagSchema[]> =>
      this.client.Tags.all(projectId, {...options, page});

    for await (const tag of this.paginate<Types.TagSchema>(
      fetchPage,
      `tags for project ${projectId}`
    )) {
      yield {
        name: tag.name,
        title: tag.message,
        commit_id: tag.commit?.id,
      };
    }
  }
}
