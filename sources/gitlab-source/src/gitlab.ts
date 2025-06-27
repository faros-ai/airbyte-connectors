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
export const DEFAULT_GRAPHQL_PAGE_SIZE = 50;
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
  protected readonly graphqlPageSize: number;
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
    this.graphqlPageSize =
      config.graphql_page_size ?? DEFAULT_GRAPHQL_PAGE_SIZE;
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
      this.logger.debug('Verifying GitLab credentials by fetching metadata');
      const metadata = await this.client.Metadata.show();
      if (metadata?.version) {
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
  async getGroups(): Promise<FarosGroupOutput[]> {
    const groups: GroupSchema[] = [];
    for await (const group of this.keysetPagination(
      (options) =>
        this.client.Groups.all({
          ...options,
          withProjects: false,
          allAvailable: this.fetchPublicGroups,
        }),
      {orderBy: 'id', sort: 'asc'}
    )) {
      groups.push(group as GroupSchema);
    }

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

  async *getProjects(groupId: string): AsyncGenerator<FarosProjectOutput> {
    for await (const project of this.keysetPagination(
      (options) => this.client.Groups.allProjects(groupId, {...options}),
      {orderBy: 'id', sort: 'asc'}
    )) {
      const typedProject = project as ProjectSchema;
      yield {
        __brand: 'FarosProject',
        id: toLower(`${typedProject.id}`),
        group_id: groupId,
        ...pick(typedProject, [
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
      };
    }
  }

  async fetchGroupMembers(groupId: string): Promise<void> {
    for await (const member of this.offsetPagination((options) =>
      this.client.GroupMembers.all(groupId, {
        ...options,
        includeInherited: true,
      })
    )) {
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
    until?: Date
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

    for await (const commit of this.offsetPagination((paginationOptions) =>
      this.client.Commits.all(projectPath, {...options, ...paginationOptions})
    )) {
      const typedCommit = commit as CommitSchema;
      const author_username = this.userCollector.getCommitAuthor(
        typedCommit.author_name,
        typedCommit.id
      );

      yield {
        __brand: 'FarosCommit',
        ...pick(typedCommit, ['id', 'message', 'created_at', 'web_url']),
        author_username,
      };
    }
  }

  async *getTags(
    projectId: string
  ): AsyncGenerator<Omit<FarosTagOutput, 'group_id' | 'project_path'>> {
    for await (const tag of this.offsetPagination((options) =>
      this.client.Tags.all(projectId, options)
    )) {
      const typedTag = tag as TagSchema;
      yield {
        __brand: 'FarosTag',
        ...pick(typedTag, ['name', 'message', 'target', 'title']),
        commit_id: typedTag.commit?.id,
      };
    }
  }

  async *getMergeRequestsWithNotes(
    projectPath: string,
    since?: Date,
    until?: Date
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
          pageSize: this.graphqlPageSize,
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
                }))
            )
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
      const mrData = mergeRequests.get(mrId);
      if (mrData) {
        for await (const note of this.getAdditionalMergeRequestNotes(
          projectPath,
          mrData.iid
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
    mergeRequestIid: number
  ): AsyncGenerator<NoteSchema> {
    for await (const note of this.offsetPagination((options) =>
      this.client.MergeRequestNotes.all(projectPath, mergeRequestIid, options)
    )) {
      const typedNote = note as NoteSchema;
      if (typedNote.system) {
        continue;
      }

      this.userCollector.collectUser(typedNote?.author);
      yield typedNote;
    }
  }

  private async *keysetPagination<T>(
    apiCall: (options: any) => Promise<T[]>,
    options: {
      orderBy: string;
      sort?: 'asc' | 'desc';
      perPage?: number;
    } = {orderBy: 'id'}
  ): AsyncGenerator<T> {
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
        for (const item of data) {
          yield item;
        }

        hasMore =
          paginationInfo.next !== null && paginationInfo.next !== undefined;
        if (hasMore && data.length > 0) {
          const lastItem = data[data.length - 1];
          idAfter = lastItem.id?.toString();
        }
      } else {
        for (const item of response) {
          yield item;
        }
        hasMore = false;
      }
    }
  }

  private async *offsetPagination<T>(
    apiCall: (options: any) => Promise<T[]>,
    options: {
      perPage?: number;
      page?: number;
    } = {}
  ): AsyncGenerator<T> {
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
        for (const item of data) {
          yield item;
        }

        hasMore =
          paginationInfo.next !== null && paginationInfo.next !== undefined;
        if (hasMore) {
          currentPage = paginationInfo.next;
        }
      } else {
        for (const item of response) {
          yield item;
        }
        hasMore = false;
      }
    }
  }

  async *getMergeRequestEvents(
    projectPath: string,
    since?: Date,
    until?: Date
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

    for await (const event of this.offsetPagination((paginationOptions) =>
      this.client.Events.all({
        projectId: projectPath,
        ...options,
        ...paginationOptions,
      })
    )) {
      const typedEvent = event as EventSchema;
      this.userCollector.collectUser(typedEvent?.author);

      yield {
        __brand: 'FarosMergeRequestReview',
        ...pick(typedEvent, [
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
    until?: Date
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

    for await (const issue of this.offsetPagination((paginationOptions) =>
      this.client.Issues.all({...options, ...paginationOptions, projectId})
    )) {
      const typedIssue = issue as IssueSchema;
      this.userCollector.collectUser(typedIssue.author);

      for (const assignee of typedIssue.assignees) {
        this.userCollector.collectUser(assignee);
      }

      yield {
        __brand: 'FarosIssue',
        ...pick(typedIssue, [
          'id',
          'title',
          'description',
          'state',
          'created_at',
          'updated_at',
          'labels',
        ]),
        author_username: typedIssue.author.username,
        assignee_usernames:
          typedIssue.assignees?.map((assignee: any) => assignee.username) ?? [],
      };
    }
  }
}
