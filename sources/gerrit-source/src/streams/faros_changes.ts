import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {GerritChange} from '../types';
import {StreamBase} from './stream_base';

export class FarosChanges extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosChanges.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    _syncMode: SyncMode,
    _cursorField?: string[]
  ): AsyncGenerator<GerritChange> {
    const gerrit = await this.gerrit();
    const projectFilter = this.projectFilter();

    // Build query for changes
    const queries: string[] = [];

    // Add project filters
    const specificProjects = projectFilter.getProjectsToFetch();
    if (specificProjects?.length) {
      for (const project of specificProjects) {
        queries.push(`project:${project}`);
      }
    } else {
      // Get all projects first to apply filters
      const projects = await gerrit.getProjects({});
      const filteredProjects = Object.keys(projects).filter((projectName) =>
        projectFilter.shouldIncludeProject(projectName)
      );

      for (const project of filteredProjects) {
        queries.push(`project:${project}`);
      }
    }

    // Add date filters if configured
    if (this.config.startDate) {
      const startDate = this.config.startDate.toISOString().split('T')[0];
      queries.push(`after:${startDate}`);
    }

    if (this.config.endDate) {
      const endDate = this.config.endDate.toISOString().split('T')[0];
      queries.push(`before:${endDate}`);
    }

    // Process each query (one per project or combined)
    const batchSize = 10; // Process projects in batches to avoid URL length limits
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const query = batch.join(' OR ');

      let start = 0;
      const limit = this.config.page_size ?? 100;

      while (true) {
        const changes = await gerrit.getChanges({
          query,
          limit,
          start,
        });

        if (changes.length === 0) break;

        for (const change of changes) {
          yield change;
        }

        if (changes.length < limit) break;
        start += limit;
      }
    }
  }
}
