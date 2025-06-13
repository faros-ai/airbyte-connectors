import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Codacy} from '../codacy';
import {CodacyConfig, CodacyRepository} from '../types';

export class Repositories extends AirbyteStreamBase {
  constructor(
    private readonly config: CodacyConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/repositories.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'updatedAt';
  }

  async *readRecords(): AsyncGenerator<CodacyRepository> {
    const codacy = await Codacy.instance(this.config, this.logger);
    const repositories = await codacy.getOrganizationRepositories();
    
    const configuredRepos = this.config.repositories;
    const filteredRepos = configuredRepos?.length 
      ? repositories.filter(repo => configuredRepos.includes(repo.name) || configuredRepos.includes(repo.fullName))
      : repositories;

    for (const repository of filteredRepos) {
      yield repository;
    }
  }
}
