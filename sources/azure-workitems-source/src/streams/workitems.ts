import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {
  calculateUpdatedStreamState,
  StreamState,
  SyncMode,
} from 'faros-airbyte-cdk';
import {WorkItemWithRevisions} from 'faros-airbyte-common/azure-devops';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {StreamWithProjectSlices} from './common';

export class Workitems extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workitems.json');
  }

  get cursorField(): string | string[] {
    return 'System.ChangedDate';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectReference,
    streamState?: StreamState
  ): AsyncGenerator<WorkItemWithRevisions> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger,
      this.config.additional_fields
    );
    const {name} = streamSlice;
    const since =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[name]?.cutoff
        : undefined;

    yield* azureWorkitem.getWorkitems(streamSlice, since);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: WorkItemWithRevisions
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(
      latestRecord.fields['System.ChangedDate']
    );
    return calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      latestRecord.project.name
    );
  }
}
