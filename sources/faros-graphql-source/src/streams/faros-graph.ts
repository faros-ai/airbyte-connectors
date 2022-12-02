import {createHash} from 'crypto';
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
  PathToModel,
  pathToModelV1,
  pathToModelV2,
  Schema,
  toIncrementalV1,
  toIncrementalV2,
} from 'faros-js-client';
import {FarosClient} from 'faros-js-client';
import {omit} from 'lodash';
import _ from 'lodash';
import {Dictionary} from 'ts-essentials';

import {GraphQLConfig, GraphQLVersion, ResultModel} from '..';

const DEFAULT_PAGE_SIZE = 100;
// January 1, 2200
const INFINITY = 7258118400000;
const INFINITY_ISO_STRING = new Date(INFINITY).toISOString();

type GraphQLState = {
  [queryHashOrModelName: string]: {refreshedAtMillis: number};
};

type StreamSlice = {
  query: string;
  incremental: boolean;
  pathToModel: PathToModel;
};

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
    const schema = await this.faros.introspect(this.config.graph);
    if (this.config.query) {
      this.logger.debug('Single query specified');
      yield {
        query: this.config.query,
        incremental: false,
        pathToModel:
          this.config.graphql_api === GraphQLVersion.V1
            ? pathToModelV1(this.config.query, schema)
            : pathToModelV2(this.config.query, schema),
      };
    } else {
      const primaryKeys: Dictionary<ReadonlyArray<string>> = {};
      let gqlSchemaV2: Schema;

      if (this.config.graphql_api === GraphQLVersion.V1) {
        for (const model of await this.faros.models(this.config.graph)) {
          primaryKeys[model.name] = model.key;
        }
      } else {
        gqlSchemaV2 = await this.faros.gqlSchema(this.config.graph);
      }

      const queries =
        this.config.graphql_api === GraphQLVersion.V1
          ? createIncrementalQueriesV1(schema, primaryKeys, false)
          : createIncrementalQueriesV2(
              schema,
              gqlSchemaV2.primaryKeys,
              gqlSchemaV2.references,
              false
            );
      this.logger.debug(
        `No query specified. Will execute ${queries.length} queries to fetch all models`
      );
      for (const query of queries) {
        yield {
          query: query.gql,
          incremental: true,
          pathToModel:
            this.config.graphql_api === GraphQLVersion.V1
              ? pathToModelV1(query.gql, schema)
              : pathToModelV2(query.gql, schema),
        };
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: GraphQLState
  ): AsyncGenerator<Dictionary<any, string>, any, undefined> {
    const {query, incremental, pathToModel}: StreamSlice = streamSlice;
    this.logger.debug(`Processing query: "${query}"`);

    let stateKey = pathToModel.modelName;
    if (!incremental) {
      stateKey = createHash('md5').update(query).digest('hex');
      this.logger.debug(
        `Used "${stateKey}" as key to state for query: "${query}"`
      );
    }

    this.state = syncMode === SyncMode.INCREMENTAL ? streamState ?? {} : {};
    let refreshedAtMillis = 0;
    if (this.state[stateKey]) {
      refreshedAtMillis = this.state[stateKey].refreshedAtMillis;
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

      if (refreshedAtMillis < recordRefreshedAtMillis) {
        refreshedAtMillis = recordRefreshedAtMillis;
        this.state[stateKey] = {refreshedAtMillis};
      }

      // Remove metadata/refreshedAt
      // We only use these fields for updating the incremental state
      const result = omit(item, ['metadata', 'refreshedAt']);

      yield _.set(
        {},
        this.config.result_model === ResultModel.Nested
          ? // Return the record as a single element array at the given path
            // E.g., if path is ['vcs', 'pullRequests', 'nodes'] and the original record is {'number':1}, the returned record
            // will look like:
            // "vcs": {
            //   "pullRequests": {
            //     "nodes": [{'number':1}]
            //   }
            // }
            [...pathToModel.path, 0]
          : pathToModel.modelName,
        result
      );
    }
  }

  getUpdatedState(): GraphQLState {
    return this.state;
  }
}
