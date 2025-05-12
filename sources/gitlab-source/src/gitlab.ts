import {AirbyteLogger} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {Gitlab as GitLabAPI} from '@gitbeaker/node';
import {GraphQLClient} from 'graphql-request';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';
import Bottleneck from 'bottleneck';
import {toLower} from 'lodash';

import {
  Commit,
  GitLabConfig,
  Group,
  Issue,
  MergeRequest,
  Project,
  Release,
  Tag,
  User,
} from './types';

export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_GRAPHQL_PAGE_SIZE = 40;
export const DEFAULT_GRAPHQL_TIMEOUT = 60000;
export const DEFAULT_GRAPHQL_RETRIES = 3;
export const DEFAULT_CONCURRENCY_LIMIT = 5;
export const DEFAULT_FAROS_GRAPH = 'default';
export const DEFAULT_API_URL = 'https://gitlab.com/api/v4';
export const DEFAULT_RUN_MODE = 'Full';

export class GitLab {
  private static gitlab: GitLab = null;
  
  constructor(
    private readonly client: any, // GitLab API client
    private readonly gqlClient: GraphQLClient,
    private readonly pageSize: number,
    private readonly graphqlPageSize: number,
    private readonly graphqlTimeout: number,
    private readonly graphqlRetries: number,
    private readonly concurrencyLimit: number,
    private readonly logger: AirbyteLogger,
    private readonly requestedStreams: Set<string>
  ) {}

  static async instance(
    config: GitLabConfig,
    logger: AirbyteLogger
  ): Promise<GitLab> {
    if (GitLab.gitlab) return GitLab.gitlab;
    
    const token = config.token;
    if (!token) {
      throw new VError('GitLab token is required');
    }

    const apiUrl = config.api_url ?? DEFAULT_API_URL;
    const pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    const graphqlPageSize = config.graphql_page_size ?? DEFAULT_GRAPHQL_PAGE_SIZE;
    const graphqlTimeout = config.graphql_timeout ?? DEFAULT_GRAPHQL_TIMEOUT;
    const graphqlRetries = config.graphql_retries ?? DEFAULT_GRAPHQL_RETRIES;
    const concurrencyLimit = config.concurrency_limit ?? DEFAULT_CONCURRENCY_LIMIT;
    const requestedStreams = config.requestedStreams ?? new Set();

    const client = new GitLabAPI({
      host: apiUrl,
      token: token,
    });

    const gqlEndpoint = apiUrl.replace(/\/api\/v4\/?$/, '') + '/api/graphql';
    const gqlClient = new GraphQLClient(gqlEndpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    GitLab.gitlab = new GitLab(
      client,
      gqlClient,
      pageSize,
      graphqlPageSize,
      graphqlTimeout,
      graphqlRetries,
      concurrencyLimit,
      logger,
      requestedStreams
    );

    return GitLab.gitlab;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.Users.current();
    } catch (err: any) {
      throw new VError(
        err,
        'Failed to connect to GitLab API. Please check your token and API URL.'
      );
    }
  }

  @Memoize()
  async getGroups(): Promise<ReadonlyArray<Group>> {
    try {
      const groups: Group[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.Groups.all({
          perPage: this.pageSize,
          page: page,
        });

        if (response.length === 0) {
          hasMore = false;
        } else {
          groups.push(...response);
          page++;
        }
      }

      return groups;
    } catch (err: any) {
      throw new VError(err, 'Failed to fetch GitLab groups');
    }
  }

  async getGroup(path: string): Promise<Group> {
    try {
      return await this.client.Groups.show(path);
    } catch (err: any) {
      throw new VError(err, `Failed to fetch GitLab group: ${path}`);
    }
  }

  async getProjects(groupPath: string): Promise<ReadonlyArray<Project>> {
    try {
      const projects: Project[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.Groups.projects(groupPath, {
          perPage: this.pageSize,
          page: page,
          includeSubgroups: false,
        });

        if (response.length === 0) {
          hasMore = false;
        } else {
          projects.push(...response);
          page++;
        }
      }

      return projects;
    } catch (err: any) {
      throw new VError(err, `Failed to fetch projects for group: ${groupPath}`);
    }
  }

  async *getMergeRequests(
    projectPath: string,
    startDate: Date,
    endDate: Date
  ): AsyncGenerator<MergeRequest> {
    try {
      const limiter = new Bottleneck({
        maxConcurrent: this.concurrencyLimit,
      });

      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await limiter.schedule(() =>
          this.client.MergeRequests.all({
            projectId: projectPath,
            updatedAfter: startDate.toISOString(),
            updatedBefore: endDate.toISOString(),
            perPage: this.pageSize,
            page: page,
            scope: 'all',
          })
        );

        const mergeRequests = response as MergeRequest[];
        
        if (mergeRequests.length === 0) {
          hasMore = false;
        } else {
          for (const mr of mergeRequests) {
            yield mr;
          }
          page++;
        }
      }
    } catch (err: any) {
      throw new VError(
        err,
        `Failed to fetch merge requests for project: ${projectPath}`
      );
    }
  }

  async *getIssues(
    projectPath: string,
    startDate: Date,
    endDate: Date
  ): AsyncGenerator<Issue> {
    try {
      const limiter = new Bottleneck({
        maxConcurrent: this.concurrencyLimit,
      });

      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await limiter.schedule(() =>
          this.client.Issues.all({
            projectId: projectPath,
            updatedAfter: startDate.toISOString(),
            updatedBefore: endDate.toISOString(),
            perPage: this.pageSize,
            page: page,
            scope: 'all',
          })
        );

        const issues = response as Issue[];
        
        if (issues.length === 0) {
          hasMore = false;
        } else {
          for (const issue of issues) {
            yield issue;
          }
          page++;
        }
      }
    } catch (err: any) {
      throw new VError(
        err,
        `Failed to fetch issues for project: ${projectPath}`
      );
    }
  }

  async *getCommits(
    projectPath: string,
    branch: string,
    startDate: Date,
    endDate: Date
  ): AsyncGenerator<Commit> {
    try {
      const limiter = new Bottleneck({
        maxConcurrent: this.concurrencyLimit,
      });

      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await limiter.schedule(() =>
          this.client.Commits.all(projectPath, {
            ref_name: branch,
            since: startDate.toISOString(),
            until: endDate.toISOString(),
            perPage: this.pageSize,
            page: page,
          })
        );

        const commits = response as Commit[];
        
        if (commits.length === 0) {
          hasMore = false;
        } else {
          for (const commit of commits) {
            yield commit;
          }
          page++;
        }
      }
    } catch (err: any) {
      throw new VError(
        err,
        `Failed to fetch commits for project: ${projectPath}, branch: ${branch}`
      );
    }
  }

  async *getTags(projectPath: string): AsyncGenerator<Tag> {
    try {
      const limiter = new Bottleneck({
        maxConcurrent: this.concurrencyLimit,
      });

      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await limiter.schedule(() =>
          this.client.Tags.all(projectPath, {
            perPage: this.pageSize,
            page: page,
          })
        );

        const tags = response as Tag[];
        
        if (tags.length === 0) {
          hasMore = false;
        } else {
          for (const tag of tags) {
            yield tag;
          }
          page++;
        }
      }
    } catch (err: any) {
      throw new VError(
        err,
        `Failed to fetch tags for project: ${projectPath}`
      );
    }
  }

  async *getReleases(projectPath: string): AsyncGenerator<Release> {
    try {
      const limiter = new Bottleneck({
        maxConcurrent: this.concurrencyLimit,
      });

      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await limiter.schedule(() =>
          this.client.Releases.all(projectPath, {
            perPage: this.pageSize,
            page: page,
          })
        );

        const releases = response as Release[];
        
        if (releases.length === 0) {
          hasMore = false;
        } else {
          for (const release of releases) {
            yield release;
          }
          page++;
        }
      }
    } catch (err: any) {
      throw new VError(
        err,
        `Failed to fetch releases for project: ${projectPath}`
      );
    }
  }

  async *getUsers(groupPath: string): AsyncGenerator<User> {
    try {
      const limiter = new Bottleneck({
        maxConcurrent: this.concurrencyLimit,
      });

      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await limiter.schedule(() =>
          this.client.GroupMembers.all(groupPath, {
            perPage: this.pageSize,
            page: page,
          })
        );

        const users = response as User[];
        
        if (users.length === 0) {
          hasMore = false;
        } else {
          for (const user of users) {
            yield user;
          }
          page++;
        }
      }
    } catch (err: any) {
      throw new VError(
        err,
        `Failed to fetch users for group: ${groupPath}`
      );
    }
  }
}
