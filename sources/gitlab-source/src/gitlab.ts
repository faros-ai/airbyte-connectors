import {Gitlab as GitlabClient} from '@gitbeaker/rest';
const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const subDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
};

const format = (date: Date, formatStr: string): string => {
  if (formatStr === 'yyyy-MM-dd') {
    return date.toISOString().split('T')[0];
  }
  return date.toISOString();
};
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {validateBucketingConfig} from 'faros-airbyte-common/common';
type Commit = any;
type GitLabToken = any;
type Group = any;
type Issue = any;
type MergeRequest = any;
type MergeRequestEvent = any;
type MergeRequestNote = any;
type Project = any;
type Tag = any;
import {GraphQLClient} from 'graphql-request';
import {toLower} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {MERGE_REQUESTS_QUERY} from './queries';
import {RunMode} from './streams/common';
import {GitLabConfig} from './types';
import {GitLabUserResponse} from './types/api';
import {UserCollector} from './user-collector';

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
  private readonly client: InstanceType<typeof GitlabClient>;
  private readonly gqlClient: GraphQLClient;
  protected readonly pageSize: number;
  protected readonly fetchPublicGroups: boolean;
  public readonly userCollector: UserCollector;

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

    this.gqlClient = new GraphQLClient(`${this.getBaseUrl()}/api/graphql`, {
      headers: {
        authorization: `Bearer ${this.getToken()}`,
      },
    });

    this.pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    this.fetchPublicGroups =
      config.fetch_public_groups ?? DEFAULT_FETCH_PUBLIC_GROUPS;
    this.userCollector = new UserCollector(logger);
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
        'Verifying GitLab credentials by fetching projects'
      );
      const projects = await this.client.Projects.all({ simple: true, perPage: 1 });
      if (projects && Array.isArray(projects)) {
        this.logger.debug(
          'GitLab credentials verified.',
          `Found ${projects.length} projects`
        );
      } else {
        this.logger.error(
          'GitLab projects response was not an array or was null: %s',
          JSON.stringify(projects)
        );
        throw new VError(
          'GitLab authentication failed. Please check your GitLab instance is reachable and your API token is valid'
        );
      }
    } catch (err: any) {
      this.logger.error('Failed to fetch GitLab projects: %s', err.message);
      throw new VError(
        err,
        'GitLab authentication failed. Please check your API token and permissions'
      );
    }
  }

  @Memoize()
  async getGroups(): Promise<Group[]> {
    const groups = await this.keysetPagination(
      (options) => this.client.Groups.all({
        ...options,
        withProjects: false,
        allAvailable: this.fetchPublicGroups,
      }),
      { orderBy: 'id', sort: 'asc' }
    );

    return groups.map((group: any) => GitLab.convertGitLabGroup(group));
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
    const projects = await this.keysetPagination(
      (options) => this.client.Projects.all({ groupId, ...options }),
      { orderBy: 'id', sort: 'asc' }
    );

    return projects.map((project: any) => ({
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
      empty_repo: project.empty_repo as boolean,
    }));
  }

  async fetchGroupMembers(groupId: string): Promise<void> {
    const members = await this.offsetPagination(
      (options) => this.client.GroupMembers.all(groupId, {
        ...options,
        includeInherited: true,
      }),
      { perPage: this.pageSize }
    );

    for (const member of members) {
      this.userCollector.collectUser({
        ...(member as any),
        group_id: groupId,
      } as unknown as GitLabUserResponse);
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
    };

    if (since) {
      options.since = since.toISOString();
    }

    if (until) {
      options.until = until.toISOString();
    }

    const commits = await this.keysetPagination(
      (paginationOptions) => this.client.Commits.all(projectPath, {...options, ...paginationOptions}),
      { orderBy: 'id', sort: 'asc' }
    );

    for (const commit of commits) {
      const author = this.userCollector.getCommitAuthor(
        (commit as any).author_name,
        (commit as any).id
      );

      const commitData = commit as any;
      yield {
        id: commitData.id,
        short_id: commitData.short_id,
        created_at:
          commitData.created_at instanceof Date
            ? commitData.created_at.toISOString()
            : commitData.created_at,
        parent_ids: commitData.parent_ids ?? [],
        title: commitData.title,
        message: commitData.message,
        author_name: commitData.author_name,
        author_email: commitData.author_email,
        authored_date:
          commitData.authored_date instanceof Date
            ? commitData.authored_date.toISOString()
            : commitData.authored_date,
        committer_name: commitData.committer_name,
        committer_email: commitData.committer_email,
        committed_date:
          commitData.committed_date instanceof Date
            ? commitData.committed_date.toISOString()
            : commitData.committed_date,
        web_url: commitData.web_url,
        branch: branch,
        author_username: author,
      };
    }
  }

  async *getTags(
    projectId: string
  ): AsyncGenerator<Omit<Tag, 'group_id' | 'project_path'>> {
    const tags = await this.keysetPagination(
      (options) => this.client.Tags.all(projectId, options),
      { orderBy: 'name', sort: 'asc' }
    );

    for (const tag of tags) {
      const tagData = tag as any;
      yield {
        name: tagData.name,
        title: tagData.message,
        commit_id: tagData.commit?.id,
      };
    }
  }

  async *getMergeRequestsWithNotes(
    projectPath: string,
    since?: Date,
    until?: Date
  ): AsyncGenerator<MergeRequest> {
    const mrNotes = new Map<string, Set<any>>();
    const needsMoreNotes = new Set<string>();
    const mrDataMap = new Map<string, any>();

    let cursor: string | null = null;
    let hasNextPage = true;

    // Phase 1: GraphQL MR + first page notes
    while (hasNextPage) {
      try {
        const result: any = await this.gqlClient.request(MERGE_REQUESTS_QUERY, {
          fullPath: projectPath,
          pageSize: this.pageSize,
          cursor,
          updatedAfter: since?.toISOString(),
          updatedBefore: until?.toISOString(),
        });

        const requests = result.project?.mergeRequests;
        if (!requests?.nodes?.length) {
          break;
        }

        for (const mrData of requests.nodes) {
          // Store MR data and first page notes
          mrNotes.set(
            mrData.id,
            new Set(mrData.notes.nodes.filter((note) => !note.system))
          );
          mrDataMap.set(mrData.id, mrData);

          // Track if more notes needed
          if (mrData.notes.pageInfo.hasNextPage) {
            needsMoreNotes.add(mrData.id);
          }

          if (mrData.author?.username) {
            this.userCollector.collectUser(
              mrData.author as unknown as GitLabUserResponse
            );
          }

          mrData.assignees?.nodes?.forEach((assignee: any) => {
            if (assignee?.username) {
              this.userCollector.collectUser(
                assignee as unknown as GitLabUserResponse
              );
            }
          });

          mrData.notes.nodes.forEach((note: any) => {
            if (note.author?.username) {
              this.userCollector.collectUser(
                note.author as unknown as GitLabUserResponse
              );
            }
          });
        }

        cursor = requests.pageInfo.endCursor;
        hasNextPage = requests.pageInfo.hasNextPage;
      } catch (err: any) {
        this.logger.error(
          `Failed to fetch merge requests for project ${projectPath}: ${err.message}`
        );
        throw new VError(
          err,
          `Error fetching merge requests for project ${projectPath}`
        );
      }
    }

    // Phase 2: REST API for additional notes
    for (const mrId of needsMoreNotes) {
      const mrData = mrDataMap.get(mrId);
      if (mrData) {
        for await (const note of this.getAdditionalMergeRequestNotes(
          projectPath,
          mrData.iid
        )) {
          mrNotes.get(mrId)?.add(note);
        }
      }
    }

    // Phase 3: Emit complete MR records
    for (const [mrId, notes] of mrNotes) {
      const mrData = mrDataMap.get(mrId);
      if (mrData) {
        yield {
          ...mrData,
          notes: Array.from(notes),
          project_path: projectPath,
        };
      }
    }
  }

  async *getAdditionalMergeRequestNotes(
    projectPath: string,
    mergeRequestIid: number
  ): AsyncGenerator<MergeRequestNote> {
    const notes = await this.offsetPagination(
      (options) => this.client.MergeRequestNotes.all(projectPath, mergeRequestIid, options),
      { perPage: this.pageSize }
    );

    for (const note of notes) {
      const noteData = note as any;
      if (noteData.system) {
        continue;
      }

      if (noteData.author?.username) {
        this.userCollector.collectUser(
          noteData.author as unknown as GitLabUserResponse
        );
      }

      yield {
        id: noteData.id,
        author: noteData.author,
        body: noteData.body,
        system: noteData.system,
        createdAt: noteData.created_at,
        updatedAt: noteData.updated_at,
      };
    }
  }

  private async keysetPagination<T>(
    apiCall: (options: any) => Promise<T[]>,
    options: {
      orderBy: string;
      sort?: 'asc' | 'desc';
      perPage?: number;
      maxPages?: number;
    } = { orderBy: 'id' }
  ): Promise<T[]> {
    const results: T[] = [];
    const paginationOptions = {
      pagination: 'keyset' as const,
      orderBy: options.orderBy,
      sort: options.sort || 'asc',
      perPage: options.perPage || this.pageSize,
      maxPages: options.maxPages || 10
    };

    try {
      const response = await apiCall(paginationOptions);
      results.push(...response);
      return results;
    } catch (error) {
      this.logger.warn(`Keyset pagination failed, falling back to offset: ${error}`);
      return this.offsetPagination(apiCall, {
        perPage: options.perPage,
        maxPages: options.maxPages
      });
    }
  }

  private async offsetPagination<T>(
    apiCall: (options: any) => Promise<T[]>,
    options: {
      perPage?: number;
      maxPages?: number;
      page?: number;
    } = {}
  ): Promise<T[]> {
    const results: T[] = [];
    const paginationOptions = {
      pagination: 'offset' as const,
      perPage: options.perPage || this.pageSize,
      maxPages: options.maxPages || 10,
      page: options.page
    };

    const response = await apiCall(paginationOptions);
    results.push(...response);
    return results;
  }

  async *getMergeRequestEvents(
    projectPath: string,
    since?: Date,
    until?: Date
  ): AsyncGenerator<MergeRequestEvent> {
    const options: any = {
      targetType: 'merge_request',
      action: 'approved',
      perPage: this.pageSize,
    };

    if (since) {
      options.after = format(subDays(since, 1), 'yyyy-MM-dd');
    }

    if (until) {
      options.before = format(addDays(until, 1), 'yyyy-MM-dd');
    }

    const events = await this.offsetPagination(
      (paginationOptions) => this.client.Events.all({projectId: projectPath, ...options, ...paginationOptions}),
      { perPage: this.pageSize }
    );

    for (const event of events) {
      const eventData = event as any;
      if (eventData.author?.username) {
        this.userCollector.collectUser(
          eventData.author as unknown as GitLabUserResponse
        );
      }

      yield {
        id: eventData.id,
        action_name: eventData.action_name,
        target_iid: eventData.target_iid,
        target_type: eventData.target_type,
        author: eventData.author,
        created_at: eventData.created_at,
        project_path: projectPath,
      };
    }
  }

  async *getIssues(
    projectId: string,
    since?: Date,
    until?: Date
  ): AsyncGenerator<Omit<Issue, 'group_id' | 'project_path'>> {
    const options: any = {
      perPage: this.pageSize,
      orderBy: 'updated_at',
      sort: 'desc',
    };

    if (since) {
      options.updatedAfter = since.toISOString();
    }

    if (until) {
      options.updatedBefore = until.toISOString();
    }

    const issues = await this.keysetPagination(
      (paginationOptions) => this.client.Issues.all({...options, ...paginationOptions, projectId}),
      { orderBy: 'updated_at', sort: 'desc' }
    );

    for (const issue of issues) {
      const issueData = issue as any;
      if (issueData.author?.username) {
        this.userCollector.collectUser(
          issueData.author as unknown as GitLabUserResponse
        );
      }

      if (issueData.assignees && Array.isArray(issueData.assignees)) {
        for (const assignee of issueData.assignees) {
          this.userCollector.collectUser(
            assignee as unknown as GitLabUserResponse
          );
        }
      }

      yield {
        id: issueData.id,
        title: issueData.title,
        description: issueData.description,
        state: issueData.state,
        created_at: issueData.created_at,
        updated_at: issueData.updated_at,
        labels: issueData.labels || [],
        assignees: issueData.assignees && Array.isArray(issueData.assignees)
          ? issueData.assignees.map((assignee: any) => ({
              username: assignee.username as string,
            }))
          : [],
        author: {username: issueData.author.username as string},
      };
    }
  }
}
