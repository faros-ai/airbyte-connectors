import {Gitlab as GitlabClient} from '@gitbeaker/rest';
import {addDays, format, subDays} from 'date-fns';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {validateBucketingConfig} from 'faros-airbyte-common/common';
export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committed_date: string;
  created_at: string;
  message: string;
  parent_ids?: string[];
  committer_name?: string;
  committer_email?: string;
  web_url?: string;
  branch?: string;
  author_username?: string;
  group_id: string;
  project_path: string;
}

export interface GitLabGroup {
  id: string;
  name: string;
  path: string;
  description: string;
  web_url: string;
  parent_id: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
}

export interface GitLabProject {
  id: string;
  name: string;
  path: string;
  path_with_namespace: string;
  web_url: string;
  description: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  default_branch: string;
  namespace: any;
  owner: any;
  archived: boolean;
  empty_repo: boolean;
  group_id: string;
}

export interface GitLabIssue {
  id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  author: { username: string };
  assignees: Array<{ username: string }>;
  labels: string[];
  group_id: string;
  project_path: string;
}

export interface GitLabTag {
  name: string;
  message: string;
  target: string;
  commit: GitLabCommit;
  commit_id?: string;
  title?: string;
  group_id: string;
  project_path: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  author: { username: string };
  group_id: string;
}

export interface GitLabMergeRequestEvent {
  id: number;
  action_name: string;
  target_iid: number;
  target_type: string;
  author: { username: string };
  created_at: string;
  group_id: string;
  project_path: string;
}

export interface GitLabMergeRequestNote {
  id: number;
  author: { username: string };
  body: string;
  system: boolean;
  created_at: string;
  updated_at: string;
}

export type GitLabToken = any;
type Commit = GitLabCommit;
type Group = GitLabGroup;
type Issue = GitLabIssue;
type MergeRequest = GitLabMergeRequest;
type MergeRequestEvent = GitLabMergeRequestEvent;
type MergeRequestNote = GitLabMergeRequestNote;
type Project = GitLabProject;
type Tag = GitLabTag;
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
        'Verifying GitLab credentials by fetching metadata'
      );
      const metadata = await this.client.Metadata.show();
      if (metadata && metadata.version) {
        this.logger.debug(
          'GitLab credentials verified.',
          `Connected to GitLab version ${metadata.version}`
        );
      } else {
        this.logger.error(
          'GitLab metadata response was invalid: %s',
          JSON.stringify(metadata)
        );
        throw new VError(
          'GitLab authentication failed. Please check your GitLab instance is reachable and your API token is valid'
        );
      }
    } catch (err: any) {
      this.logger.error('Failed to fetch GitLab metadata: %s', err.message);
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
      visibility: group.visibility || 'private',
      created_at: group.created_at,
      updated_at: group.updated_at,
    } as Group;
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
      visibility: project.visibility || 'private',
      created_at: project.created_at,
      updated_at: project.updated_at || new Date().toISOString(),
      namespace: project.namespace,
      owner: project.owner,
      default_branch: project.default_branch,
      archived: project.archived || false,
      group_id: groupId,
      empty_repo: project.empty_repo || false,
    }));
  }

  async fetchGroupMembers(groupId: string): Promise<void> {
    const members = await this.offsetPagination(
      (options) => this.client.GroupMembers.all(groupId, {
        ...options,
        includeInherited: true,
      })
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
    if (typeof auth === 'object' && auth.type !== 'token') {
      throw new VError('Only token authentication is supported');
    }
    if (typeof auth === 'object') {
      return auth.personal_access_token;
    }
    return auth;
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
  ): AsyncGenerator<GitLabCommit> {
    const options: any = {
      refName: branch,
    };

    if (since) {
      options.since = since.toISOString();
    }

    if (until) {
      options.until = until.toISOString();
    }

    const commits = await this.offsetPagination(
      (paginationOptions) => this.client.Commits.all(projectPath, {...options, ...paginationOptions})
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
        group_id: '',
        project_path: projectPath,
      };
    }
  }

  async *getTags(
    projectId: string
  ): AsyncGenerator<GitLabTag> {
    const tags = await this.offsetPagination(
      (options) => this.client.Tags.all(projectId, options)
    );

    for (const tag of tags) {
      const tagData = tag as any;
      yield {
        name: tagData.name,
        message: tagData.message,
        target: tagData.target,
        commit: tagData.commit,
        title: tagData.message,
        commit_id: tagData.commit?.id,
        group_id: '',
        project_path: projectId,
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
      (options) => this.client.MergeRequestNotes.all(projectPath, mergeRequestIid, options)
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
        created_at: noteData.created_at,
        updated_at: noteData.updated_at,
      };
    }
  }

  private async keysetPagination<T>(
    apiCall: (options: any) => Promise<T[]>,
    options: {
      orderBy: string;
      sort?: 'asc' | 'desc';
      perPage?: number;
    } = { orderBy: 'id' }
  ): Promise<T[]> {
    const results: T[] = [];
    let hasMore = true;
    let idAfter: string | undefined;

    while (hasMore) {
      const paginationOptions: any = {
        pagination: 'keyset' as const,
        orderBy: options.orderBy,
        sort: options.sort || 'asc',
        perPage: options.perPage || this.pageSize,
        showExpanded: true
      };

      if (idAfter) {
        paginationOptions.idAfter = idAfter;
      }

      const response = await apiCall(paginationOptions);
      
      if (response && typeof response === 'object' && 'data' in response && 'paginationInfo' in response) {
        const { data, paginationInfo } = response as any;
        results.push(...data);
        
        hasMore = paginationInfo.next !== null && paginationInfo.next !== undefined;
        if (hasMore && data.length > 0) {
          const lastItem = data[data.length - 1];
          idAfter = lastItem.id?.toString();
        }
      } else {
        results.push(...(response as T[]));
        hasMore = false;
      }
    }

    return results;
  }

  private async offsetPagination<T>(
    apiCall: (options: any) => Promise<T[]>,
    options: {
      perPage?: number;
      page?: number;
    } = {}
  ): Promise<T[]> {
    const results: T[] = [];
    let currentPage = options.page || 1;
    let hasMore = true;

    while (hasMore) {
      const paginationOptions = {
        pagination: 'offset' as const,
        perPage: options.perPage || this.pageSize,
        page: currentPage,
        showExpanded: true
      };

      const response = await apiCall(paginationOptions);
      
      if (response && typeof response === 'object' && 'data' in response && 'paginationInfo' in response) {
        const { data, paginationInfo } = response as any;
        results.push(...data);
        
        hasMore = paginationInfo.next !== null && paginationInfo.next !== undefined;
        if (hasMore) {
          currentPage = paginationInfo.next;
        }
      } else {
        results.push(...(response as T[]));
        hasMore = false;
      }
    }

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
      (paginationOptions) => this.client.Events.all({projectId: projectPath, ...options, ...paginationOptions})
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
        group_id: undefined,
      };
    }
  }

  async *getIssues(
    projectId: string,
    since?: Date,
    until?: Date
  ): AsyncGenerator<GitLabIssue> {
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

    const issues = await this.offsetPagination(
      (paginationOptions) => this.client.Issues.all({...options, ...paginationOptions, projectId})
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
        group_id: '',
        project_path: projectId,
      };
    }
  }
}
