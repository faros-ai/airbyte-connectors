import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {GerritProject} from '../types';
import {StreamBase} from './stream_base';

export class FarosProjects extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosProjects.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    _syncMode: SyncMode,
    _cursorField?: string[]
  ): AsyncGenerator<GerritProject> {
    const gerrit = await this.gerrit();
    const projectFilter = this.projectFilter();

    // Get all projects or filtered projects
    projectFilter.getProjectsToFetch();

    // Always use pagination approach for consistency
    {
      // Fetch all projects with pagination
      let start = 0;
      const limit = this.config.page_size ?? 100;

      while (true) {
        const projects = await gerrit.getProjects({
          limit,
          start,
          description: true,
        });

        const projectEntries = Object.entries(projects);
        if (projectEntries.length === 0) break;

        for (const [projectName, project] of projectEntries) {
          if (projectFilter.shouldIncludeProject(projectName)) {
            yield {
              ...project,
              name: projectName,
            };
          }
        }

        if (projectEntries.length < limit) break;
        start += limit;
      }
    }
  }
}
