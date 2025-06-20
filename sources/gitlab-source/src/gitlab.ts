import {
  Camelize,
  CommitSchema,
  EventSchema,
  Gitlab as GitlabClient,
  GroupSchema,
  IssueSchema,
  LabelSchema,
  NoteSchema,
  ProjectSchema,
  TagSchema,
} from '@gitbeaker/rest';
import {addDays, format, subDays} from 'date-fns';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {validateBucketingConfig} from 'faros-airbyte-common/common';
import {
  FarosCommitOutput,
  FarosGroupOutput,
  FarosIssueOutput,
  FarosMergeRequestOutput,
  FarosMergeRequestReviewOutput,
  FarosProjectOutput,
  FarosTagOutput,
} from 'faros-airbyte-common/gitlab';
import {GraphQLClient} from 'graphql-request';
import {pick, toLower} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {MERGE_REQUESTS_QUERY} from './queries';
import {RunMode} from './streams/common';
import {GitLabConfig, GitLabToken} from './types';
import {GitLabUserResponse, UserCollector} from './user-collector';

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
    protected readonly logger: AirbyteLogger,
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
    logger: AirbyteLogger,
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
      this.logger.debug('Verifying GitLab credentials by fetching metadata');
      const metadata = await this.client.Metadata.show();
      if (metadata?.version) {
        this.logger.debug(
          'GitLab credentials verified.',
          `Connected to GitLab version ${metadata.version}`,
        );
      } else {
        this.logger.error(
          'GitLab metadata response was invalid: %s',
          JSON.stringify(metadata),
        );
        throw new VError(
          'GitLab authentication failed. Please check your GitLab instance is reachable and your API token is valid',
        );
      }
    } catch (err: any) {
      this.logger.error('Failed to fetch GitLab metadata: %s', err.message);
      throw new VError(
        err,
        'GitLab authentication failed. Please check your API token and permissions',
      );
    }
  }

  @Memoize()
  async getGroups(): Promise<FarosGroupOutput[]> {
    const groups = (await this.keysetPagination(
      (options) =>
        this.client.Groups.all({
          ...options,
          withProjects: false,
          allAvailable: this.fetchPublicGroups,
        }),
      {orderBy: 'id', sort: 'asc'},
    )) as GroupSchema[];

    return groups.map((group) => GitLab.convertGroup(group));
  }

  static convertGroup(group: GroupSchema): FarosGroupOutput {
    return {
      __brand: 'FarosGroup',
      id: toLower(`${group.id}`),
      parent_id: group.parent_id ? toLower(`${group.parent_id}`) : null,
      ...pick(group, [
        'created_at',
        'description',
        'name',
        'path',
        'updated_at',
        'visibility',
        'web_url',
      ]),
    };
  }

  @Memoize()
  async getGroup(groupId: string): Promise<FarosGroupOutput> {
    try {
      const group = (await this.client.Groups.show(groupId)) as GroupSchema;
      return GitLab.convertGroup(group);
    } catch (err: any) {
      this.logger.error(`Failed to fetch group ${groupId}: ${err.message}`);
      throw new VError(err, `Error fetching group ${groupId}`);
    }
  }

  async getProjects(groupId: string): Promise<FarosProjectOutput[]> {
    const projects = (await this.keysetPagination(
      (options) => this.client.Groups.allProjects(groupId, {...options}),
      {orderBy: 'id', sort: 'asc'},
    )) as ProjectSchema[];

    return projects.map((project: ProjectSchema) => ({
      __brand: 'FarosProject',
      id: toLower(`${project.id}`),
      group_id: groupId,
      ...pick(project, [
        'archived',
        'created_at',
        'default_branch',
        'description',
        'empty_repo',
        'name',
        'namespace',
        'owner',
        'path',
        'path_with_namespace',
        'updated_at',
        'visibility',
        'web_url',
      ]),
    }));
  }

  async fetchGroupMembers(groupId: string): Promise<void> {
    const members = await this.offsetPagination((options) =>
      this.client.GroupMembers.all(groupId, {
        ...options,
        includeInherited: true,
      }),
    );

    for (const member of members) {
      this.userCollector.collectUser({
        ...member,
        group_id: groupId,
      });
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

  async *getCommits(
    projectPath: string,
    branch: string,
    since?: Date,
    until?: Date,
  ): AsyncGenerator<
    Omit<FarosCommitOutput, 'branch' | 'group_id' | 'project_path'>
  > {
    const options: any = {
      refName: branch,
    };

    if (since) {
      options.since = since.toISOString();
    }

    if (until) {
      options.until = until.toISOString();
    }

    const commits = (await this.offsetPagination((paginationOptions) =>
      this.client.Commits.all(projectPath, {...options, ...paginationOptions}),
    )) as CommitSchema[];

    for (const commit of commits) {
      const author_username = this.userCollector.getCommitAuthor(
        commit.author_name,
        commit.id,
      );

      yield {
        __brand: 'FarosCommit',
        ...pick(commit, ['id', 'message', 'created_at', 'web_url']),
        author_username,
      };
    }
  }

  async *getTags(
    projectId: string,
  ): AsyncGenerator<Omit<FarosTagOutput, 'group_id' | 'project_path'>> {
    const tags = (await this.offsetPagination((options) =>
      this.client.Tags.all(projectId, options),
    )) as TagSchema[];

    for (const tag of tags) {
      yield {
        __brand: 'FarosTag',
        ...pick(tag, ['name', 'message', 'target', 'title']),
        commit_id: tag.commit?.id,
      };
    }
  }

  async *getMergeRequestsWithNotes(
    projectPath: string,
    since?: Date,
    until?: Date,
  ): AsyncGenerator<
    Omit<FarosMergeRequestOutput, 'group_id' | 'project_path'>
  > {
    const notes = new Map<number, Set<NoteSchema>>();
    const needsMoreNotes = new Set<number>();
    const mergeRequests = new Map<number, any>();

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

        for (const mr of requests.nodes) {
          // Store MR data and first page notes
          notes.set(
            mr.id,
            new Set(
              mr.notes.nodes
                .filter((note: Camelize<NoteSchema>) => !note.system)
                .map((note: Camelize<NoteSchema>) => ({
                  ...pick(note, ['author', 'id', 'body']),
                  created_at: note.createdAt,
                  updated_at: note.updatedAt,
                })),
            ),
          );
          mergeRequests.set(mr.id, mr);

          // Track if more notes needed
          if (mr.notes.pageInfo.hasNextPage) {
            needsMoreNotes.add(mr.id);
          }

          this.userCollector.collectUser(mr?.author);

          mr.assignees?.nodes?.forEach((assignee: GitLabUserResponse) => {
            this.userCollector.collectUser(assignee);
          });

          mr.notes.nodes.forEach((note: NoteSchema) => {
            this.userCollector.collectUser(note?.author);
          });
        }

        cursor = requests.pageInfo.endCursor;
        hasNextPage = requests.pageInfo.hasNextPage;
      } catch (err: any) {
        this.logger.error(
          `Failed to fetch merge requests for project ${projectPath}: ${err.message}`,
        );
        throw new VError(
          err,
          `Error fetching merge requests for project ${projectPath}`,
        );
      }
    }

    // Phase 2: REST API for additional notes
    for (const mrId of needsMoreNotes) {
      const mrData = mergeRequests.get(mrId);
      if (mrData) {
        for await (const note of this.getAdditionalMergeRequestNotes(
          projectPath,
          mrData.iid,
        )) {
          notes.get(mrId)?.add(note);
        }
      }
    }

    // Phase 3: Emit complete MR records
    for (const [mrId, mrNotes] of notes) {
      const mr = mergeRequests.get(mrId);
      if (mr) {
        yield {
          __brand: 'FarosMergeRequest',
          author_username: mr.author.username,
          labels: mr.labels.nodes.map((label: LabelSchema) => label.title),
          notes: Array.from(mrNotes).map((note: NoteSchema) => ({
            ...pick(note, ['id', 'body', 'created_at', 'updated_at']),
            author_username: note.author.username,
          })),
          ...pick(mr, [
            'iid',
            'title',
            'description',
            'state',
            'webUrl',
            'createdAt',
            'updatedAt',
            'mergedAt',
            'commitCount',
            'userNotesCount',
            'diffStatsSummary',
            'mergeCommitSha',
          ]),
        };
      }
    }
  }

  async *getAdditionalMergeRequestNotes(
    projectPath: string,
    mergeRequestIid: number,
  ): AsyncGenerator<NoteSchema> {
    const notes = (await this.offsetPagination((options) =>
      this.client.MergeRequestNotes.all(projectPath, mergeRequestIid, options),
    )) as NoteSchema[];

    for (const note of notes) {
      if (note.system) {
        continue;
      }

      this.userCollector.collectUser(note?.author);
      yield note;
    }
  }

  private async keysetPagination<T>(
    apiCall: (options: any) => Promise<T[]>,
    options: {
      orderBy: string;
      sort?: 'asc' | 'desc';
      perPage?: number;
    } = {orderBy: 'id'},
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
        showExpanded: true,
      };

      if (idAfter) {
        paginationOptions.idAfter = idAfter;
      }

      const response = await apiCall(paginationOptions);

      if (
        response &&
        typeof response === 'object' &&
        'data' in response &&
        'paginationInfo' in response
      ) {
        const {data, paginationInfo} = response as any;
        results.push(...data);

        hasMore =
          paginationInfo.next !== null && paginationInfo.next !== undefined;
        if (hasMore && data.length > 0) {
          const lastItem = data[data.length - 1];
          idAfter = lastItem.id?.toString();
        }
      } else {
        results.push(...response);
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
    } = {},
  ): Promise<T[]> {
    const results: T[] = [];
    let currentPage = options.page || 1;
    let hasMore = true;

    while (hasMore) {
      const paginationOptions = {
        pagination: 'offset' as const,
        perPage: options.perPage || this.pageSize,
        page: currentPage,
        showExpanded: true,
      };

      const response = await apiCall(paginationOptions);

      if (
        response &&
        typeof response === 'object' &&
        'data' in response &&
        'paginationInfo' in response
      ) {
        const {data, paginationInfo} = response as any;
        results.push(...data);

        hasMore =
          paginationInfo.next !== null && paginationInfo.next !== undefined;
        if (hasMore) {
          currentPage = paginationInfo.next;
        }
      } else {
        results.push(...response);
        hasMore = false;
      }
    }

    return results;
  }

  async *getMergeRequestEvents(
    projectPath: string,
    since?: Date,
    until?: Date,
  ): AsyncGenerator<
    Omit<FarosMergeRequestReviewOutput, 'group_id' | 'project_path'>
  > {
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

    const events = (await this.offsetPagination((paginationOptions) =>
      this.client.Events.all({
        projectId: projectPath,
        ...options,
        ...paginationOptions,
      }),
    )) as EventSchema[];

    for (const event of events) {
      this.userCollector.collectUser(event?.author);

      yield {
        __brand: 'FarosMergeRequestReview',
        ...pick(event, [
          'action_name',
          'author_username',
          'created_at',
          'id',
          'target_iid',
          'target_type',
        ]),
      };
    }
  }

  async *getIssues(
    projectId: string,
    since?: Date,
    until?: Date,
  ): AsyncGenerator<Omit<FarosIssueOutput, 'group_id' | 'project_path'>> {
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

    const issues = (await this.offsetPagination((paginationOptions) =>
      this.client.Issues.all({...options, ...paginationOptions, projectId}),
    )) as IssueSchema[];

    for (const issue of issues) {
      this.userCollector.collectUser(issue.author);

      for (const assignee of issue.assignees) {
        this.userCollector.collectUser(assignee);
      }

      yield {
        __brand: 'FarosIssue',
        ...pick(issue, [
          'id',
          'title',
          'description',
          'state',
          'created_at',
          'updated_at',
          'labels',
        ]),
        author_username: issue.author.username,
        assignee_usernames:
          issue.assignees?.map((assignee: any) => assignee.username) ?? [],
      };
    }
  }
}
