import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {GitLabConfig} from '../types';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

export class Releases extends StreamWithProjectSlices {
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(config, logger, farosClient);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/releases.json');
  }

  get primaryKey(): StreamKey {
    return ['project_path', 'tag_name'];
  }

  get name(): string {
    return 'gitlab_releases';
  }

  get supportsIncremental(): boolean {
    return false;
  }

  get dependencies(): ReadonlyArray<string> {
    return ['gitlab_projects'];
  }

  get cursorField(): string[] {
    return [];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any>> {
    if (!streamSlice) return;
    
    const {group, project} = streamSlice;
    const gitlab = await GitLab.instance(this.config, this.logger);
    
    try {
      const projectPath = `${group}/${project}`;
      const releases = gitlab.getReleases(projectPath);
      
      for await (const release of releases) {
        yield {
          ...release,
          project_path: projectPath,
        };
      }
    } catch (error: any) {
      this.logger.error(
        `Error fetching releases for ${group}/${project}: ${error.message}`
      );
    }
  }
}
