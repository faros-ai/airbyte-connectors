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

export class Issues extends StreamWithProjectSlices {
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(config, logger, farosClient);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/issues.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get name(): string {
    return 'gitlab_issues';
  }

  get supportsIncremental(): boolean {
    return true;
  }

  get dependencies(): ReadonlyArray<string> {
    return ['gitlab_projects'];
  }

  get cursorField(): string[] {
    return ['updated_at'];
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
    
    const cutoff = this.getCutoffFromState(streamState, group, project);
    const [startDate, endDate] = this.getUpdateRange(cutoff);
    
    try {
      const projectPath = `${group}/${project}`;
      const issues = gitlab.getIssues(
        projectPath,
        startDate,
        endDate
      );
      
      let latestCutoff = cutoff ? new Date(cutoff) : null;
      
      for await (const issue of issues) {
        const updatedAt = new Date(issue.updated_at);
        if (!latestCutoff || updatedAt > latestCutoff) {
          latestCutoff = updatedAt;
        }
        
        yield {
          ...issue,
          project_path: projectPath,
        };
      }
      
      if (latestCutoff) {
        const projectKey = `${group}/${project}`;
        this.logger.info(
          `Synced issues for ${projectKey} up to ${latestCutoff.toISOString()}`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error fetching issues for ${group}/${project}: ${error.message}`
      );
    }
  }
}
