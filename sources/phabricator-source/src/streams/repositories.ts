import iDiffusion from 'condoit/dist/interfaces/iDiffusion';
import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Phabricator, PhabricatorConfig} from '../phabricator';

type Repository = iDiffusion.retDiffusionRepositorySearchData;

export interface RepositoriesState {
  latestCreatedAt: number;
}

export class Repositories extends AirbyteStreamBase {
  constructor(
    private readonly config: PhabricatorConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/repositories.json');
  }
  get primaryKey(): StreamKey {
    throw 'phid';
  }
  get cursorField(): string[] {
    return ['fields', 'dateCreated'];
  }
  getUpdatedState(
    currentStreamState: RepositoriesState,
    latestRecord: Repository
  ): RepositoriesState {
    const latestCreated = currentStreamState?.latestCreatedAt ?? 0;
    const recordCreated = latestRecord.fields?.dateCreated ?? 0;
    currentStreamState.latestCreatedAt = Math.max(latestCreated, recordCreated);
    return currentStreamState;
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: RepositoriesState
  ): AsyncGenerator<Repository, any, any> {
    const phabricator = await Phabricator.make(this.config, this.logger);
    if (!phabricator) return;

    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const createdAt = state?.latestCreatedAt ?? 0;
    yield* phabricator.getRepositories(createdAt);
  }
}
