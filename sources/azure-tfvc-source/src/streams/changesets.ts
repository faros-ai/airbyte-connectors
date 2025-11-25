import {StreamKey, SyncMode} from 'faros-airbyte-cdk';

import {AzureTfvc} from '../azure-tfvc';
import {
  BranchStreamSlice,
  BranchStreamState,
  StreamWithBranchSlices,
} from './common';

interface ChangesetRecord {
  organization: string;
  branch?: string;
  [key: string]: any;
}

export class Changesets extends StreamWithBranchSlices {
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
    streamSlice?: BranchStreamSlice,
    streamState?: BranchStreamState
  ): AsyncGenerator<ChangesetRecord> {
    const tfvc = await AzureTfvc.instance(
      this.config,
      this.logger,
      this.config.include_changes,
      this.config.include_work_items,
      this.config.branch_pattern
    );

    const projectName = streamSlice.project.name;
    const branchPath = streamSlice.branch?.path;
    const cutoff = this.getBranchCutoff(syncMode, streamSlice, streamState);

    for await (const changeset of tfvc.getChangesets(projectName, cutoff, branchPath)) {
      yield {
        ...changeset,
        branch: branchPath,
        organization: streamSlice.organization,
      };
    }
  }

  getUpdatedState(
    currentStreamState: BranchStreamState,
    latestRecord: ChangesetRecord
  ): BranchStreamState {
    const projectName = latestRecord.project?.name;
    if (!projectName || !latestRecord.createdDate) {
      return currentStreamState;
    }
    return this.updateBranchState(
      currentStreamState,
      projectName,
      latestRecord.branch,
      new Date(latestRecord.createdDate)
    );
  }
}
