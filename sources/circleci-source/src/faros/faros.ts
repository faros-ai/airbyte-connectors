import {AirbyteLogger} from 'faros-airbyte-cdk';
import {
  FarosClient,
  FarosClientConfig,
  paginatedQueryV2,
} from 'faros-js-client';

interface RepoKey {
  name: string;
  organization: {
    uid: string;
    source: string;
  };
}

const DEFAULT_FAROS_GRAPH = 'default';

export class Faros {
  private readonly faros: FarosClient;

  constructor(
    config: FarosClientConfig,
    private readonly logger: AirbyteLogger
  ) {
    this.faros = new FarosClient(config);
  }

  async getExcludedRepos(graph = DEFAULT_FAROS_GRAPH): Promise<RepoKey[]> {
    this.logger.debug(
      `Checking which repos are excluded in [${graph}] Faros graph`
    );
    const query: string = `query ExcludedRepos {
        vcs_Repository(where: {farosOptions: {inclusionCategory: {_eq: "Excluded"}}}) {
            name
            organization {
                uid
                source
            }
        }
    }`;
    const iter: AsyncIterable<RepoKey> = this.faros.nodeIterable(
      graph,
      query,
      undefined,
      paginatedQueryV2
    );
    const res = [];
    for await (const repoKey of iter) {
      res.push({
        name: repoKey.name.toLowerCase(),
        organization: {
          uid: repoKey.organization.uid.toLowerCase(),
          source: repoKey.organization.source.toLowerCase(),
        },
      });
    }
    return res;
  }
}
