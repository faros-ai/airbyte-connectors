import {StreamKey, SyncMode} from 'faros-airbyte-cdk';

import {AzureTfvc} from '../azure-tfvc';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

interface BranchRecord {
  organization: string;
  project: {id: string; name: string};
  [key: string]: any;
}

export class Branches extends StreamWithProjectSlices {
  getJsonSchema(): Record<string, any> {
    return require('../../resources/schemas/branches.json');
  }

  get primaryKey(): StreamKey {
    return 'path';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice
  ): AsyncGenerator<BranchRecord> {
    const tfvc = await AzureTfvc.instance(
      this.config,
      this.logger,
      this.config.include_changes ?? true
    );

    const project = streamSlice.project;
    const branches = await tfvc.getBranches(project.id);

    for (const branch of branches) {
      yield {
        ...branch,
        organization: streamSlice.organization,
        project: {id: project.id, name: project.name},
      };
    }
  }
}
