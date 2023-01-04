import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {Folder, List, Space, Workspace} from 'faros-airbyte-common/clickup';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {ClickUpConfig} from '.';

const DEFAULT_TIMEOUT = 60_000;
const BASE_API_URL = 'https://api.clickup.com/api/v2';

export class ClickUp {
  constructor(
    private readonly logger: AirbyteLogger,
    private readonly api: AxiosInstance
  ) {}

  static instance(cfg: ClickUpConfig, logger: AirbyteLogger): ClickUp {
    if (!cfg.token) {
      throw new VError('api_token must not be an empty string');
    }
    if (cfg.cutoff_days < 1) {
      throw new VError('cutoff_days must be a positive number');
    }
    if (cfg.timeout < 1) {
      throw new VError('timeout must be a positive number');
    }
    const api = axios.create({
      baseURL: BASE_API_URL,
      timeout: cfg.timeout ?? DEFAULT_TIMEOUT,
      maxContentLength: 10_000_000,
      headers: {
        authorization: cfg.token,
        'content-type': 'application/json',
      },
    });
    return new ClickUp(logger, api);
  }

  async checkConnection(): Promise<void> {
    const workspaces = await this.workspaces();
    if (workspaces.length <= 0) {
      throw new VError('No workspaces were found');
    }
  }

  @Memoize()
  async workspaces(): Promise<ReadonlyArray<Workspace>> {
    try {
      return (await this.api.get('/team')).data.teams;
    } catch (err) {
      throw new VError(wrapApiError(err as any), 'Failed to fetch workspaces');
    }
  }

  async fetchData<T>(
    fetch: (archived: boolean) => Promise<ReadonlyArray<T>>,
    fetchArchived: boolean,
    errorMsg: string,
    ...errorMsgParams: ReadonlyArray<any>
  ): Promise<ReadonlyArray<T>> {
    try {
      const results = [];
      results.push(...(await fetch(false)));
      if (fetchArchived) {
        results.push(...(await fetch(true)));
      }
      return results;
    } catch (err) {
      throw new VError(wrapApiError(err as any), errorMsg, ...errorMsgParams);
    }
  }

  @Memoize(
    (workspaceId: string, fetchArchived: boolean) =>
      `${workspaceId};${fetchArchived}`
  )
  async spaces(
    workspaceId: string,
    fetchArchived = false
  ): Promise<ReadonlyArray<Space>> {
    return await this.fetchData(
      async (archived) => {
        return (
          await this.api.get(`/team/${workspaceId}/space`, {params: {archived}})
        ).data.spaces;
      },
      fetchArchived,
      'Failed to fetch spaces for workspace id %s',
      workspaceId
    );
  }

  @Memoize(
    (spaceId: string, fetchArchived: boolean) => `${spaceId};${fetchArchived}`
  )
  async folders(
    spaceId: string,
    fetchArchived = false
  ): Promise<ReadonlyArray<Folder>> {
    return await this.fetchData(
      async (archived) => {
        return (
          await this.api.get(`/space/${spaceId}/folder`, {params: {archived}})
        ).data.folders;
      },
      fetchArchived,
      'Failed to fetch folders for space id %s',
      spaceId
    );
  }

  @Memoize(
    (folderId: string, fetchArchived: boolean) => `${folderId};${fetchArchived}`
  )
  async listsInFolder(
    folderId: string,
    fetchArchived = false
  ): Promise<ReadonlyArray<List>> {
    return await this.fetchData(
      async (archived) => {
        return (
          await this.api.get(`/folder/${folderId}/list`, {params: {archived}})
        ).data.lists;
      },
      fetchArchived,
      'Failed to fetch lists for folder id %s',
      folderId
    );
  }

  @Memoize(
    (spaceId: string, fetchArchived: boolean) => `${spaceId};${fetchArchived}`
  )
  async listsInSpace(
    spaceId: string,
    fetchArchived = false
  ): Promise<ReadonlyArray<List>> {
    return await this.fetchData(
      async (archived) => {
        return (
          await this.api.get(`/space/${spaceId}/list`, {params: {archived}})
        ).data.lists;
      },
      fetchArchived,
      'Failed to fetch lists for space id %s',
      spaceId
    );
  }
}
