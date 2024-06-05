import {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import _ from 'lodash';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {
  AsanaResponse,
  CompactTask,
  Project,
  ProjectTaskAssociation,
  Story,
  Tag,
  Task,
  User,
  Workspace,
} from './models';

export const MIN_DATE = new Date(0).toISOString();
// January 1, 2200
export const MAX_DATE = new Date(7258118400000).toISOString();

const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_API_TIMEOUT_MS = 0; // 0 means no timeout
const DEFAULT_RETRIES = 3;

export interface AsanaConfig {
  credentials: {
    personal_access_token?: string;
  };
  workspaces?: ReadonlyArray<string>;
  page_size?: number;
  api_timeout?: number;
  max_retries?: number;
  start_date?: string;
  end_date?: string;
  cutoff_days?: number;
}

export class Asana {
  private static asana: Asana;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly startDate: string,
    private readonly endDate: string,
    private readonly workspaces: ReadonlyArray<string>,
    private readonly pageSize: number
  ) {}

  static instance(config: AsanaConfig, logger?: AirbyteLogger): Asana {
    if (Asana.asana) return Asana.asana;

    if (!config.credentials?.personal_access_token) {
      throw new VError('Please provide a personal access token');
    }

    let startDate: string;
    let endDate: string;

    if (config.start_date || config.end_date) {
      startDate = config.start_date ?? MIN_DATE;
      endDate = config.end_date ?? MAX_DATE;
    } else {
      const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);
      startDate = cutoffDate.toISOString();
      endDate = new Date().toISOString();
    }

    const httpClient = makeAxiosInstanceWithRetry(
      {
        baseURL: `https://app.asana.com/api/1.0`,
        timeout: config.api_timeout ?? DEFAULT_API_TIMEOUT_MS,
        maxContentLength: Infinity, //default is 2000 bytes
        headers: {
          Authorization: `Bearer ${config.credentials.personal_access_token}`,
        },
      },
      logger.asPino(),
      config.max_retries ?? DEFAULT_RETRIES,
      10000
    );

    Asana.asana = new Asana(
      httpClient,
      startDate,
      endDate,
      config.workspaces,
      config.page_size ?? DEFAULT_PAGE_SIZE
    );

    return Asana.asana;
  }

  async checkConnection(): Promise<void> {
    let emptyWorkspaces = false;

    try {
      const workspaces = await this.getWorkspaces();
      emptyWorkspaces = _.isEmpty(workspaces);
    } catch (err: any) {
      let errorMessage = 'Please verify your access token is correct. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }

    if (emptyWorkspaces) {
      throw new VError('No workspaces found.');
    }
  }

  @Memoize()
  async getWorkspaces(): Promise<ReadonlyArray<Workspace>> {
    const params = {limit: this.pageSize};
    let hasNext = true;
    let offset = undefined;
    const workspaces: Workspace[] = [];

    while (hasNext) {
      if (offset) {
        params['offset'] = offset;
      }

      const res = await this.httpClient.get<AsanaResponse<Workspace>>(
        `workspaces`,
        {params}
      );

      workspaces.push(
        ...res.data.data.filter(
          (workspace) =>
            _.isEmpty(this.workspaces) ||
            this.workspaces.includes(workspace.gid)
        )
      );
      hasNext =
        !_.isNil(res.data.next_page) && !_.isNil(res.data.next_page.offset);

      if (hasNext) {
        offset = res.data.next_page?.offset;
      }
    }

    return workspaces;
  }

  async *getTasks(
    workspace: string,
    after?: string,
    logger?: AirbyteLogger
  ): AsyncGenerator<Task> {
    const opt_fields = [
      'assignee',
      'completed',
      'created_at',
      'custom_fields',
      'memberships.section',
      'memberships.section.name',
      'modified_at',
      'name',
      'notes',
      'parent',
      'permalink_url',
      'resource_type',
      'workspace',
      'completed_at',
    ];

    const params = {
      limit: this.pageSize,
      'modified_at.before': this.endDate,
      sort_by: 'modified_at',
      sort_ascending: true,
      opt_fields: opt_fields.join(','),
    };

    let modified_at_after = after ?? this.startDate;
    let seenIdsPreviousPage = new Set<string>();

    while (modified_at_after) {
      logger?.info(
        `Fetching tasks for workspace ${workspace} from ${modified_at_after} to ${this.endDate}`
      );

      params['modified_at.after'] = modified_at_after;
      modified_at_after = undefined;
      const seenIdsCurrentPage = new Set<string>();

      const res = await this.httpClient.get<AsanaResponse<Task>>(
        `workspaces/${workspace}/tasks/search`,
        {params}
      );

      for (const task of res.data.data) {
        if (seenIdsPreviousPage.has(task.gid)) continue;
        seenIdsCurrentPage.add(task.gid);
        modified_at_after = task.modified_at;
        yield {
          ...task,
          stories: await this.getFilteredStories(task.gid),
        };
      }

      seenIdsPreviousPage = seenIdsCurrentPage;
    }
  }

  async *getProjects(
    workspace: string,
    logger?: AirbyteLogger
  ): AsyncGenerator<Project> {
    logger?.info(`Fetching projects for workspace ${workspace}`);
    yield* this.fetchData<Project>(`workspaces/${workspace}/projects`, [
      'name',
      'created_at',
      'modified_at',
      'workspace',
      'notes',
    ]);
  }

  async *getProjectTasks(
    project: string,
    logger?: AirbyteLogger
  ): AsyncGenerator<ProjectTaskAssociation> {
    logger?.info(`Fetching tasks for project ${project}`);
    for await (const compactTask of this.fetchData<CompactTask>(
      `projects/${project}/tasks`,
      []
    )) {
      yield {
        project_gid: project,
        task_gid: compactTask.gid,
      };
    }
  }

  async getFilteredStories(task: string): Promise<ReadonlyArray<Story>> {
    const opt_fields = [
      'assignee',
      'created_at',
      'resource_subtype',
      'task',
      'duplicate_of',
    ];
    const stories: Story[] = [];
    for await (const story of this.fetchData<Story>(
      `tasks/${task}/stories`,
      opt_fields
    )) {
      if (
        [
          'marked_complete',
          'marked_incomplete',
          'assigned',
          'unassigned',
          'added_to_task',
          'removed_from_task',
          'marked_duplicate',
          'unmarked_duplicate',
        ].includes(story.resource_subtype)
      ) {
        stories.push(story);
      }
    }

    return stories;
  }

  async *getTags(workspace: string): AsyncGenerator<Tag> {
    const opt_fields = ['name'];
    yield* this.fetchData<Tag>(`workspaces/${workspace}/tags`, opt_fields);
  }

  async *getUsers(workspace: string): AsyncGenerator<User> {
    const opt_fields = ['email', 'name'];
    yield* this.fetchData<User>(`/users`, opt_fields, {workspace});
  }

  async *fetchData<T>(
    endpoint: string,
    optFields: string[],
    queryParams?: Record<string, string>
  ): AsyncGenerator<T> {
    const baseParams = {limit: this.pageSize, opt_fields: optFields.join(',')};
    const params = queryParams ? {...baseParams, ...queryParams} : baseParams;
    let hasNext = true;
    let offset = undefined;

    while (hasNext) {
      if (offset) {
        params['offset'] = offset;
      }

      const res = await this.httpClient.get<AsanaResponse<T>>(endpoint, {
        params,
      });

      for (const data of res.data.data) {
        yield data;
      }

      hasNext =
        !_.isNil(res.data.next_page) && !_.isNil(res.data.next_page.offset);

      if (hasNext) {
        offset = res.data.next_page?.offset;
      }
    }
  }
}
