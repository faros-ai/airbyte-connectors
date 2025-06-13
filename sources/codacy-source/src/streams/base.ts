import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamState,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Codacy} from '../codacy';
import {CodacyConfig, CodacyRepository} from '../types';

export type StreamSlice = {
  repository: CodacyRepository;
};

export abstract class CodacyStreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: CodacyConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
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

  protected getUpdateRange(cutoff?: number): [Date, Date] {
    const startDate = cutoff ? Utils.toDate(cutoff) : this.config.startDate;
    const endDate = this.config.endDate;
    
    return [
      startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      endDate || new Date(),
    ];
  }

  protected getUpdatedStateForRepository(
    currentStreamState: StreamState,
    latestRecordCutoff: Date | undefined,
    repositoryId: number
  ): StreamState {
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
}
