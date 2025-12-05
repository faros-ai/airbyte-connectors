import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Harness} from '../harness';
import {PipelineExecution} from '../harness_models';
import {PipelineStreamSlice, StreamWithPipelineSlices} from './common';

// Nested state: { [org]: { [project]: { [pipeline]: { cutoff } } } }
interface PipelineState {
  cutoff: number;
}

interface ProjectState {
  [pipelineIdentifier: string]: PipelineState;
}

interface OrgState {
  [projectIdentifier: string]: ProjectState;
}

interface ExecutionsStreamState {
  [orgIdentifier: string]: OrgState;
}

export class Executions extends StreamWithPipelineSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/executions.json');
  }

  get primaryKey(): StreamKey {
    return 'planExecutionId';
  }

  get cursorField(): string | string[] {
    return 'startTs';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: PipelineStreamSlice,
    streamState?: ExecutionsStreamState
  ): AsyncGenerator<PipelineExecution> {
    const {orgIdentifier, projectIdentifier, pipelineIdentifier} = streamSlice;
    const harness = Harness.instance(this.config, this.logger);

    const cutoff =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[orgIdentifier]?.[projectIdentifier]?.[pipelineIdentifier]
            ?.cutoff
        : undefined;

    yield* harness.getExecutions(
      orgIdentifier,
      projectIdentifier,
      pipelineIdentifier,
      cutoff
    );
  }

  getUpdatedState(
    currentStreamState: ExecutionsStreamState,
    latestRecord: PipelineExecution,
    slice: PipelineStreamSlice
  ): ExecutionsStreamState {
    const {orgIdentifier, projectIdentifier, pipelineIdentifier} = slice;
    const currentCutoff =
      currentStreamState?.[orgIdentifier]?.[projectIdentifier]?.[
        pipelineIdentifier
      ]?.cutoff ?? 0;
    const recordCutoff = latestRecord.startTs ?? 0;

    if (recordCutoff > currentCutoff) {
      return {
        ...currentStreamState,
        [orgIdentifier]: {
          ...currentStreamState?.[orgIdentifier],
          [projectIdentifier]: {
            ...currentStreamState?.[orgIdentifier]?.[projectIdentifier],
            [pipelineIdentifier]: {
              cutoff: recordCutoff,
            },
          },
        },
      };
    }

    return currentStreamState;
  }
}
