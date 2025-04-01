import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {StreamState, SyncMode} from 'faros-airbyte-cdk';
import {WorkItemWithRevisions} from 'faros-airbyte-common/azure-devops';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {StreamWithProjectSlices} from './common';

export class Workitems extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workitems.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectReference,
    streamState?: StreamState
  ): AsyncGenerator<WorkItemWithRevisions> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    const {id} = streamSlice;
    const since =
      syncMode === SyncMode.INCREMENTAL ? streamState?.[id]?.cutoff : undefined;

    yield* azureWorkitem.getWorkitems(streamSlice, since);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: WorkItemWithRevisions
  ): StreamState {
    const currentState = currentStreamState?.[latestRecord.projectId]?.cutoff;
    const newState = Math.max(
      currentState,
      Utils.toDate(latestRecord.fields['System.ChangedDate']).getTime()
    );

    return {
      ...currentStreamState,
      [latestRecord.projectId]: {
        cutoff: newState,
      },
    };
  }
}
