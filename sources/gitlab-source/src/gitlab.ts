import {Gitlab as GitlabClient, Types} from '@gitbeaker/node';
import {addDays, format, subDays} from 'date-fns';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {validateBucketingConfig} from 'faros-airbyte-common/common';
import {
  Commit,
  GitLabToken,
  Group,
  Issue,
  MERGE_REQUESTS_QUERY,
  MergeRequest,
  MergeRequestEvent,
  MergeRequestNote,
  Project,
  Tag,
  User,
} from 'faros-airbyte-common/gitlab';
import {GraphQLClient} from 'graphql-request';
import {toLower} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {RunMode} from './streams/common';
import {GitLabConfig} from './types';
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
        'Verifying GitLab credentials by fetching version info'
      );
      const versionInfo = await this.client.Version.show();
      if (versionInfo && typeof versionInfo === 'object') {
        this.logger.debug(
          'GitLab credentials verified.',
          JSON.stringify(versionInfo)
        );
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
        empty_repo: project.empty_repo as boolean,
      });
    }

    return projects;
  }

  async fetchGroupMembers(groupId: string): Promise<void> {
    const options = {
      perPage: this.pageSize,
      includeInherited: true,
    };

    const fetchPage = (page: number): Promise<Types.MemberSchema[]> =>
      this.client.GroupMembers.all(groupId, {...options, page});

    for await (const member of this.paginate<Types.MemberSchema>(
      fetchPage,
      `members for group ${groupId}`
    )) {
      this.userCollector.collectUser(member);
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
      // Try to resolve author username using UserCollector
      const author = this.userCollector.getCommitAuthor(
        commit.author_name,
        commit.id
      );

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
        author_username: author,
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
            this.userCollector.collectUser(mrData.author);
          }

          mrData.assignees?.nodes?.forEach((assignee: any) => {
            if (assignee?.username) {
              this.userCollector.collectUser(assignee);
            }
          });

          mrData.notes.nodes.forEach((note: any) => {
            if (note.author?.username) {
              this.userCollector.collectUser(note.author);
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
    const options: any = {
      perPage: this.pageSize,
    };

    const fetchPage = (page: number): Promise<any[]> =>
      this.client.MergeRequestNotes.all(projectPath, mergeRequestIid, {
        ...options,
        page,
      });

    for await (const note of this.paginate<any>(
      fetchPage,
      `additional notes for MR ${mergeRequestIid} in project ${projectPath}`
    )) {
      // Filter out system notes
      if (note.system) {
        continue;
      }

      if (note.author?.username) {
        this.userCollector.collectUser(note.author);
      }

      yield {
        id: note.id,
        author: note.author,
        body: note.body,
        system: note.system,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
      };
    }
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

    const fetchPage = (page: number): Promise<any[]> =>
      this.client.Events.all({projectId: projectPath, ...options, page});

    for await (const event of this.paginate<any>(
      fetchPage,
      `MR events for project ${projectPath} since ${options.after} until ${options.before}`
    )) {
      if (event.author?.username) {
        this.userCollector.collectUser(event.author);
      }

      yield {
        id: event.id,
        action_name: event.action_name,
        target_iid: event.target_iid,
        target_type: event.target_type,
        author: event.author,
        created_at: event.created_at,
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

    const fetchPage = (page: number): Promise<Types.IssueSchema[]> =>
      this.client.Issues.all({...options, page, projectId}) as Promise<
        Types.IssueSchema[]
      >;

    for await (const issue of this.paginate<Types.IssueSchema>(
      fetchPage,
      `issues for project ${projectId}`
    )) {
      if (issue.author?.username) {
        this.userCollector.collectUser(issue.author as unknown as User);
      }

      if (issue.assignees) {
        for (const assignee of issue.assignees) {
          this.userCollector.collectUser(assignee as unknown as User);
        }
      }

      yield {
        id: issue.id,
        title: issue.title,
        description: issue.description,
        state: issue.state,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        labels: issue.labels || [],
        assignees: issue.assignees
          ? issue.assignees.map((assignee) => ({
              username: assignee.username as string,
            }))
          : [],
        author: {username: issue.author.username as string},
      };
    }
  }
}
