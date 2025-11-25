import {StreamKey, SyncMode} from 'faros-airbyte-cdk';

import {AzureTfvc} from '../azure-tfvc';
import {
  ProjectStreamSlice,
  ProjectStreamState,
  StreamWithProjectSlices,
} from './common';

interface ChangesetRecord {
  organization: string;
  [key: string]: any;
}

export class Changesets extends StreamWithProjectSlices {
  getJsonSchema(): Record<string, any> {
    return require('../../resources/schemas/changesets.json');
  }

  get primaryKey(): StreamKey {
    return 'changesetId';
  }

  get cursorField(): string | string[] {
    return 'createdDate';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: ProjectStreamState
  ): AsyncGenerator<ChangesetRecord> {
    const tfvc = await AzureTfvc.instance(
      this.config,
      this.logger,
      this.config.include_changes ?? true
    );

    const projectName = streamSlice.project.name;
    const cutoff = this.getCutoff(syncMode, streamSlice, streamState);

    for await (const changeset of tfvc.getChangesets(projectName, cutoff)) {
      yield {
        ...changeset,
        organization: streamSlice.organization,
      };
    }
  }

  getUpdatedState(
    currentStreamState: ProjectStreamState,
    latestRecord: ChangesetRecord
  ): ProjectStreamState {
    const projectName = latestRecord.project?.name;
    if (!projectName || !latestRecord.createdDate) {
      return currentStreamState;
    }
    return this.updateState(
      currentStreamState,
      projectName,
      new Date(latestRecord.createdDate)
    );
  }
}
