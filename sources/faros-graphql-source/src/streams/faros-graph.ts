import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {
  paginatedQuery,
  paginatedQueryV2,
  toIncrementalV1,
  toIncrementalV2,
} from 'faros-js-client';
import {FarosClient} from 'faros-js-client';
import {max} from 'lodash';
import {Dictionary} from 'ts-essentials';
import VError from 'verror';

import {GraphQLConfig, GraphQLVersion} from '..';

// TODO: Make this part of the spec?
const PAGE_SIZE = 100;
const INFINITY = 8640000000000000;
const INFINITY_ISO_STRING = new Date(INFINITY).toISOString();

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
    return true;
  }

  get stateCheckpointInterval(): number | undefined {
    return 1000;
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

      let query = this.config.query;
      const args: Map<string, any> = new Map<string, any>();

      if (syncMode === SyncMode.INCREMENTAL) {
        if (this.config.graphql_api === GraphQLVersion.V1) {
          query = toIncrementalV1(query);
          args.set('from', refreshedAtMillis);
          args.set('to', INFINITY);
        } else {
          query = toIncrementalV2(query);
          args.set('from', new Date(refreshedAtMillis).toISOString());
          args.set('to', INFINITY_ISO_STRING);
        }
      }

      const nodes = faros.nodeIterable(
        this.config.graph,
        query,
        PAGE_SIZE,
        this.config.graphql_api === GraphQLVersion.V1
          ? paginatedQuery
          : paginatedQueryV2,
        args
      );

      for await (const item of nodes) {
        const recordRefreshedAtMillis =
          this.config.graphql_api === GraphQLVersion.V1
            ? Number(item['metadata']['refreshedAt']) || 0
            : new Date(item['refreshedAt']).getTime() || 0;
        refreshedAtMillis = max([refreshedAtMillis, recordRefreshedAtMillis]);

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
