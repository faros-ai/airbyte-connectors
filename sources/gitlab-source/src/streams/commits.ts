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

export class Commits extends StreamWithProjectSlices {
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(config, logger, farosClient);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/commits.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get name(): string {
    return 'gitlab_commits';
  }

  get supportsIncremental(): boolean {
    return true;
  }

  get dependencies(): ReadonlyArray<string> {
    return ['gitlab_projects'];
  }

  get cursorField(): string[] {
    return ['committed_date'];
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
      
      const projectDetails = await gitlab.getProjects(group);
      const projectsArray = [...projectDetails];
      const projectInfo = projectsArray.find(p => p.path === project);
      const defaultBranch = projectInfo?.default_branch || 'main';
      
      const commits = gitlab.getCommits(
        projectPath,
        defaultBranch,
        startDate,
        endDate
      );
      
      let latestCutoff = cutoff ? new Date(cutoff) : null;
      
      for await (const commit of commits) {
        const committedDate = new Date(commit.committed_date);
        if (!latestCutoff || committedDate > latestCutoff) {
          latestCutoff = committedDate;
        }
        
        yield {
          ...commit,
          project_path: projectPath,
          branch: defaultBranch,
        };
      }
      
      if (latestCutoff) {
        const projectKey = `${group}/${project}`;
        this.logger.info(
          `Synced commits for ${projectKey} up to ${latestCutoff.toISOString()}`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error fetching commits for ${group}/${project}: ${error.message}`
      );
    }
  }
}
