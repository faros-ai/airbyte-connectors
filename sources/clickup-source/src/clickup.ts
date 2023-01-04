import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {Folder, Space, Workspace} from 'faros-airbyte-common/clickup';
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

  @Memoize()
  async spaces(
    workspaceId: string,
    archived = false
  ): Promise<ReadonlyArray<Space>> {
    const fetchSpaces = async (archived: boolean) => {
      return await (
        await this.api.get(`/team/${workspaceId}/space`, {params: {archived}})
      ).data.spaces;
    };
    try {
      const results = [];
      results.push(...(await fetchSpaces(false)));
      if (archived) {
        results.push(...(await fetchSpaces(true)));
      }
      return results;
    } catch (err) {
      throw new VError(
        wrapApiError(err as any),
        'Failed to fetch spaces for workspace id %s',
        workspaceId
      );
    }
  }

  @Memoize()
  async folders(
    spaceId: string,
    archived = false
  ): Promise<ReadonlyArray<Folder>> {
    const fetchFolders = async (archived: boolean) => {
      return await (
        await this.api.get(`/space/${spaceId}/folder`, {params: {archived}})
      ).data.folders;
    };
    try {
      const results = [];
      results.push(...(await fetchFolders(false)));
      if (archived) {
        results.push(...(await fetchFolders(true)));
      }
      return results;
    } catch (err) {
      throw new VError(
        wrapApiError(err as any),
        'Failed to fetch folders for space id %s',
        spaceId
      );
    }
  }
}
