import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Backlog, BacklogConfig} from '../backlog';
import {Issue} from '../models';

interface IssueState {
  lastUpdatedAt: string;
}

export class Issues extends AirbyteStreamBase {
  constructor(
    private readonly config: BacklogConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/issues.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'updated';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: IssueState
  ): AsyncGenerator<Issue, any, unknown> {
    const lastUpdatedAt =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastUpdatedAt
        : undefined;
    const backlog = await Backlog.instance(this.config, this.logger);
    for (const issue of await backlog.getIssues(lastUpdatedAt)) {
      yield issue;
    }
  }

  getUpdatedState(
    currentStreamState: IssueState,
    latestRecord: Issue
  ): IssueState {
    const lastUpdatedAt: Date = new Date(latestRecord.updated);
    return {
      lastUpdatedAt:
        lastUpdatedAt >= new Date(currentStreamState?.lastUpdatedAt || 0)
          ? latestRecord.updated
          : currentStreamState.lastUpdatedAt,
    };
  }
}
