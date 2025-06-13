import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  StreamState,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Codacy} from '../codacy';
import {CodacyConfig, CodacyIssue, CodacyRepository} from '../types';

type StreamSlice = {
  repository: CodacyRepository;
};

export class Issues extends AirbyteStreamBase {
  constructor(
    private readonly config: CodacyConfig,
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
    return 'updatedAt';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const codacy = await Codacy.instance(this.config, this.logger);
    const repositories = await codacy.getOrganizationRepositories();
    
    const configuredRepos = this.config.repositories;
    const filteredRepos = configuredRepos?.length 
      ? repositories.filter(repo => configuredRepos.includes(repo.name) || configuredRepos.includes(repo.fullName))
      : repositories;

    for (const repository of filteredRepos) {
      yield {repository};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<CodacyIssue> {
    if (!streamSlice) return;
    
    const codacy = await Codacy.instance(this.config, this.logger);
    const repository = streamSlice.repository;

    const cutoff = syncMode === SyncMode.INCREMENTAL
      ? streamState?.[repository.id]?.cutoff
      : undefined;
    const [startDate] = this.getUpdateRange(cutoff);

    for await (const issue of codacy.getRepositoryIssues(repository.id, startDate)) {
      yield issue;
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: CodacyIssue,
    streamSlice?: StreamSlice
  ): StreamState {
    if (!streamSlice) return currentStreamState;
    
    const latestRecordCutoff = Utils.toDate(latestRecord.updatedAt);
    const repositoryId = streamSlice.repository.id;

    const currentState = Utils.toDate(
      currentStreamState?.[repositoryId]?.cutoff
    );
    
    if (!latestRecordCutoff) {
      return currentStreamState;
    }

    if (!currentState || (latestRecordCutoff && latestRecordCutoff.getTime() > currentState.getTime())) {
      return {
        ...currentStreamState,
        [repositoryId]: {
          cutoff: latestRecordCutoff.getTime(),
        },
      };
    }

    return currentStreamState;
  }

  private getUpdateRange(cutoff?: number): [Date, Date] {
    const startDate = cutoff ? Utils.toDate(cutoff) : this.config.startDate;
    const endDate = this.config.endDate;
    
    return [
      startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      endDate || new Date(),
    ];
  }
}
