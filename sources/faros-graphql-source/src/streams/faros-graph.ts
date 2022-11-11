import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {paginatedQuery, paginatedQueryV2} from 'faros-js-client';
import {FarosClient} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';
import VError from 'verror';

import {GraphQLConfig, GraphQLVersion} from '..';

// TODO: Make this part of the spec?
const PAGE_SIZE = 100;

type GraphQLState = {
  [query: string]: {refreshedAtMillis: number};
};

export class FarosGraph extends AirbyteStreamBase {
  private state: GraphQLState;

  constructor(readonly config: GraphQLConfig, readonly logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/faros_graph.json');
  }

  get primaryKey(): StreamKey {
    return undefined;
  }

  get supportsIncremental(): boolean {
    // TODO: Support incremental
    return false;
  }

  get stateCheckpointInterval(): number | undefined {
    return undefined;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: GraphQLState
  ): AsyncGenerator<Dictionary<any, string>, any, undefined> {
    const faros = new FarosClient({
      url: this.config.api_url,
      apiKey: this.config.api_key,
      useGraphQLV2: this.config.graphql_api === GraphQLVersion.V2,
    });
    if (!(await faros.graphExists(this.config.graph))) {
      throw new VError('Graph does not exist!');
    }

    if (this.config.query) {
      this.state = syncMode === SyncMode.INCREMENTAL ? streamState ?? {} : {};
      let refreshedAtMillis = 0;
      if (this.state[this.config.query]) {
        refreshedAtMillis = this.state[this.config.query].refreshedAtMillis;
      }

      // TODO: Filter based on refreshedAtMillis
      const nodes = faros.nodeIterable(
        this.config.graph,
        this.config.query,
        PAGE_SIZE,
        this.config.graphql_api === GraphQLVersion.V1
          ? paginatedQuery
          : paginatedQueryV2
      );

      for await (const item of nodes) {
        // TODO: Update refreshedAtMillis
        this.state = {...this.state, [this.config.query]: {refreshedAtMillis}};
        yield item;
      }
    } else {
      // TODO: Query all models
    }
  }

  getUpdatedState(
    currentStreamState: GraphQLState,
    latestRecord: Dictionary<any>
  ): GraphQLState {
    return this.state;
  }
}
