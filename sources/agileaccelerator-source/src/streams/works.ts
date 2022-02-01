import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  Agileaccelerator,
  AgileacceleratorConfig,
} from '../agileaccelerator/agileaccelerator';
import {Work} from '../agileaccelerator/types';

interface WorksState {
  cutoff: string;
}

export class Works extends AirbyteStreamBase {
  constructor(
    private readonly config: AgileacceleratorConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/works.json');
  }
  get primaryKey(): StreamKey {
    return 'Id';
  }
  get cursorField(): string | string[] {
    return 'LastModifiedDate';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: WorksState
  ): AsyncGenerator<Work> {
    const agileaccelerator = await Agileaccelerator.instance(
      this.config,
      this.logger
    );

    const cutoff =
      syncMode === SyncMode.INCREMENTAL ? streamState?.cutoff : undefined;

    yield* agileaccelerator.getWorks(cutoff);
  }

  getUpdatedState(
    currentStreamState: WorksState,
    latestRecord: Work
  ): WorksState {
    const lastUpdatedAt = latestRecord.LastModifiedDate;

    return {
      cutoff:
        new Date(lastUpdatedAt) > new Date(currentStreamState?.cutoff ?? 0)
          ? lastUpdatedAt
          : currentStreamState?.cutoff,
    };
  }
}
