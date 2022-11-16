import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {
  createIncrementalQueriesV1,
  createIncrementalQueriesV2,
  paginatedQuery,
  paginatedQueryV2,
  toIncrementalV1,
  toIncrementalV2,
} from 'faros-js-client';
import {FarosClient} from 'faros-js-client';
import {max} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {GraphQLConfig, GraphQLVersion} from '..';

const DEFAULT_PAGE_SIZE = 100;
// January 1, 2200
const INFINITY = 7258118400000;
const INFINITY_ISO_STRING = new Date(INFINITY).toISOString();

type GraphQLState = {
  [query: string]: {refreshedAtMillis: number};
};

type StreamSlice = {query: string; incremental: boolean};

export class FarosGraph extends AirbyteStreamBase {
  private state: GraphQLState;

  constructor(
    readonly config: GraphQLConfig,
    readonly logger: AirbyteLogger,
    readonly faros: FarosClient
  ) {
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

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    if (this.config.query) {
      this.logger.debug('Single query specified');
      yield {query: this.config.query, incremental: false};
    } else {
      const schema = await this.faros.introspect(this.config.graph);
      const queries =
        this.config.graphql_api === GraphQLVersion.V1
          ? createIncrementalQueriesV1(schema, false)
          : createIncrementalQueriesV2(schema, false);
      this.logger.debug(
        `No query specified. Will execute ${queries.length} queries to fetch all models`
      );
      for (const query of queries) {
        yield {query: query.gql, incremental: true};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: GraphQLState
  ): AsyncGenerator<Dictionary<any, string>, any, undefined> {
    const {query, incremental} = streamSlice;
    this.logger.debug(`Processing query: "${query}"`);

    this.state = syncMode === SyncMode.INCREMENTAL ? streamState ?? {} : {};
    let refreshedAtMillis = 0;
    if (this.state[query]) {
      refreshedAtMillis = this.state[query].refreshedAtMillis;
    }

    const args: Map<string, any> = new Map<string, any>();
    let modifiedQuery = undefined;

    if (syncMode === SyncMode.INCREMENTAL) {
      if (incremental) {
        this.logger.debug(
          `Query is in incremental format, no conversion is needed`
        );
      } else {
        this.logger.debug(
          `Query is not in incremental format, it will be converted`
        );

        if (this.config.graphql_api === GraphQLVersion.V1) {
          modifiedQuery = toIncrementalV1(query);
        } else {
          modifiedQuery = toIncrementalV2(query);
        }

        this.logger.debug(
          `Query was converted to incremental format: "${modifiedQuery}"`
        );
      }
    }

    // We need set the filter variables regardless
    // of syncMode if the query is incremental
    if (syncMode === SyncMode.INCREMENTAL || incremental) {
      if (this.config.graphql_api === GraphQLVersion.V1) {
        args.set('from', refreshedAtMillis);
        args.set('to', INFINITY);
      } else {
        args.set('from', new Date(refreshedAtMillis).toISOString());
        args.set('to', INFINITY_ISO_STRING);
      }
    }

    const nodes = this.faros.nodeIterable(
      this.config.graph,
      modifiedQuery || query,
      this.config.page_size || DEFAULT_PAGE_SIZE,
      this.config.graphql_api === GraphQLVersion.V1
        ? paginatedQuery
        : paginatedQueryV2,
      args
    );

    for await (const item of nodes) {
      const recordRefreshedAtMillis =
        this.config.graphql_api === GraphQLVersion.V1
          ? Number(item.metadata?.refreshedAt) || 0
          : new Date(item.refreshedAt).getTime() || 0;
      refreshedAtMillis = max([refreshedAtMillis, recordRefreshedAtMillis]);

      this.state = {...this.state, [query]: {refreshedAtMillis}};
      yield item;
    }
  }

  getUpdatedState(): GraphQLState {
    return this.state;
  }
}
