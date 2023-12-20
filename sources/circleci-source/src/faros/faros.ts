import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosClient, FarosClientConfig} from 'faros-js-client';

export type ExcludedRepos = Record<string, Record<string, Set<string>>>;

interface RepoKey {
  name: string;
  organization: {
    uid: string;
    source: string;
  };
}

export class Faros {
  private readonly faros: FarosClient;

  constructor(
    config: FarosClientConfig,
    private readonly logger: AirbyteLogger
  ) {
    this.faros = new FarosClient(config);
  }

  async getExcludedRepos(graph: string): Promise<ExcludedRepos> {
    this.logger.info(`Pulling excluded repos in ${graph} graph from Faros`);
    const query: string = `
    query ExcludedRepos {
        vcs_Repository(
            where: {farosOptions: {inclusionCategory: {_eq: "Excluded"}}}
        ) {
            name
            organization {
                uid
                source
            }
        }
    }
    `;
    const iter: AsyncIterable<RepoKey> = this.faros.nodeIterable(graph, query);
    const res = {};
    for await (const repoKey of iter) {
      const source = repoKey.organization.source.toLowerCase();
      const org = repoKey.organization.uid.toLowerCase();
      const repo = repoKey.name.toLowerCase();

      if (res[source] === undefined) {
        res[source] = {};
      } else {
        if (res[source][org] === undefined) {
          res[source][org] = new Set();
        }
        res[source][org].add(repo);
      }
    }
    return res;
  }
}
