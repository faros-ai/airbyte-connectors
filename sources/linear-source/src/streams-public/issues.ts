import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Issue, Linear, LinearConfig} from '../linear/linear';

interface IssueState {
  lastUpdatedAt?: string;
}

export class Issues extends AirbyteStreamBase {
  constructor(
    private readonly config: LinearConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/public/projects.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return ['updatedAt'];
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: IssueState
  ): AsyncGenerator<Issue> {
    const lastUpdatedAt =
      syncMode === SyncMode.INCREMENTAL && streamState?.lastUpdatedAt
        ? new Date(streamState.lastUpdatedAt)
        : undefined;

    const linear = Linear.instance(this.config, this.logger);
    yield* linear.getIssues(lastUpdatedAt);
  }

  getUpdatedState(
    currentStreamState: IssueState,
    latestRecord: Issue
  ): IssueState {
    const lastUpdatedAt = new Date(latestRecord.updatedAt);
    return {
      lastUpdatedAt:
        lastUpdatedAt > new Date(currentStreamState?.lastUpdatedAt || 0)
          ? latestRecord.updatedAt
          : currentStreamState.lastUpdatedAt,
    };
  }
}
