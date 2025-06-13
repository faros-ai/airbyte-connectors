import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  StreamState,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Codacy} from '../codacy';
import {CodacyConfig, CodacyMetrics,CodacyRepository} from '../types';

type StreamSlice = {
  repository: CodacyRepository;
};

export class CodeQuality extends AirbyteStreamBase {
  constructor(
    private readonly config: CodacyConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/code_quality.json');
  }

  get primaryKey(): StreamKey {
    return 'uid';
  }

  get cursorField(): string | string[] {
    return 'createdAt';
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
  ): AsyncGenerator<any> {
    if (!streamSlice) return;
    
    const codacy = await Codacy.instance(this.config, this.logger);
    const repository = streamSlice.repository;

    const cutoff = syncMode === SyncMode.INCREMENTAL
      ? streamState?.[repository.id]?.cutoff
      : undefined;
    const [startDate] = this.getUpdateRange(cutoff);

    for await (const metric of codacy.getRepositoryMetrics(repository.id, startDate)) {
      yield this.mapToCodeQuality(repository, metric);
    }
  }

  private mapToCodeQuality(repository: CodacyRepository, metrics: CodacyMetrics): any {
    const repoInfo = {
      name: toLower(repository.name),
      uid: toLower(repository.name),
      organization: {
        uid: repository.owner?.name || 'unknown',
        source: 'Codacy',
      },
    };

    const uid = `codacy_${repository.id}_${metrics.commitSha || Date.now()}`;

    return {
      uid,
      repository: repoInfo,
      createdAt: Utils.toDate(metrics.createdAt),
      coverage: metrics.coverage ? {
        category: 'Coverage',
        name: 'Coverage',
        type: 'Percent',
        value: metrics.coverage.toString(),
      } : undefined,
      complexity: metrics.complexity ? {
        category: 'Complexity',
        name: 'Complexity',
        type: 'Int',
        value: metrics.complexity.toString(),
      } : undefined,
      duplications: metrics.duplication ? {
        category: 'Duplications',
        name: 'Duplication',
        type: 'Percent',
        value: metrics.duplication.toString(),
      } : undefined,
      bugs: {
        category: 'Reliability',
        name: 'Issues',
        type: 'Int',
        value: (metrics.issues || 0).toString(),
      },
    };
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: any,
    streamSlice?: StreamSlice
  ): StreamState {
    if (!streamSlice) return currentStreamState;
    
    const latestRecordCutoff = Utils.toDate(latestRecord.createdAt);
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
