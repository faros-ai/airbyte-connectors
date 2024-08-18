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
  QueryAdapter,
  toIncrementalV1,
  toIncrementalV2,
} from 'faros-js-client';
import {FarosClient} from 'faros-js-client';
import * as gql from 'graphql';
import {omit} from 'lodash';
import _ from 'lodash';
import {Dictionary} from 'ts-essentials';
import zlib from 'zlib';

import {GraphQLConfig, GraphQLVersion, ResultModel} from '..';
import {Nodes} from '../nodes';

export const DEFAULT_BUCKET_ID = 1;
export const DEFAULT_BUCKET_TOTAL = 1;
const DEFAULT_PAGE_SIZE = 100;
// January 1, 2200
const INFINITY = 7258118400000;
const INFINITY_ISO_STRING = new Date(INFINITY).toISOString();

type GraphQLState = {
  [queryHashOrModelName: string]: {refreshedAtMillis: number};
};

interface QueryPaths {
  readonly nodeIds: string[][];
  readonly model: PathToModel;
}

type StreamSlice = {
  query: string;
  incremental: boolean;
  queryPaths: QueryPaths;
};

export class FarosGraph extends AirbyteStreamBase {
  private state: GraphQLState;
  private nodes: Nodes;
  private legacyV1Schema: gql.GraphQLSchema;
  private readonly bucketId: number;
  private readonly bucketTotal: number;

  constructor(
    readonly config: GraphQLConfig,
    readonly logger: AirbyteLogger,
    readonly faros: FarosClient
  ) {
    super(logger);

    if (config.adapt_v1_query) {
      const schemaAsString = zlib
        .gunzipSync(Buffer.from(this.config.legacy_v1_schema, 'base64'))
        .toString();
      this.legacyV1Schema = gql.buildSchema(schemaAsString);
    }

    this.bucketId = config.bucket_id ?? DEFAULT_BUCKET_ID;
    this.bucketTotal = config.bucket_total ?? DEFAULT_BUCKET_TOTAL;
  }

  private queryPaths(query: string, schema: gql.GraphQLSchema): QueryPaths {
    const modelPath =
      this.config.graphql_api === GraphQLVersion.V1 ||
      this.config.adapt_v1_query
        ? pathToModelV1(query, schema)
        : pathToModelV2(query, schema);
    const nodeIdPaths: string[][] = [];
    const fieldPath: string[] = [];
    gql.visit(gql.parse(query), {
      Field: {
        enter(node) {
          fieldPath.push(node.name.value);
          if (_.isEqual(fieldPath, modelPath.path)) {
            // Reset path once we're inside model path
            fieldPath.length = 0;
          }
          if (_.last(fieldPath) === 'id') {
            nodeIdPaths.push([...fieldPath]);
          }
        },
        leave() {
          fieldPath.pop();
        },
      },
    });
    return {nodeIds: nodeIdPaths, model: modelPath};
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
        queryPaths: this.config.adapt_v1_query
          ? this.queryPaths(this.config.query, this.legacyV1Schema)
          : this.queryPaths(this.config.query, schema),
      };
    } else {
      const queries = [];
      if (this.config.graphql_api === GraphQLVersion.V1) {
        // Don't pass in primary keys so that node IDs are used instead
        // We'll decode them to primary keys as we iterate over the data
        queries.push(...createIncrementalQueriesV1(schema, {}, false));
      } else {
        const gqlSchemaV2 = await this.faros.gqlSchema(this.config.graph);
        queries.push(
          ...createIncrementalQueriesV2(
            schema,
            gqlSchemaV2.primaryKeys,
            gqlSchemaV2.references,
            false
          )
        );
      }
      this.logger.debug(
        `No query specified. Will execute ${queries.length} queries to fetch all models`
      );
      this.logger.debug(
        `Processing bucket ${this.bucketId} of ${this.bucketTotal}`
      );

      const modelsFilter = this.config.models_filter ?? [];

      for (const query of queries) {
        const slice = {
          query: query.gql,
          incremental: true,
          queryPaths: this.queryPaths(query.gql, schema),
        };
        const modelName = slice.queryPaths.model.modelName;
        if (modelsFilter.length > 0 && !modelsFilter.includes(modelName)) {
          this.logger.debug(`Skipping fetching ${modelName}`);
          continue;
        }

        const hex = createHash('md5')
          .update(modelName)
          .digest('hex')
          .substring(0, 8);
        const bucket = (parseInt(hex, 16) % this.bucketTotal) + 1;
        if (bucket == this.bucketId) {
          this.logger.debug(`Will fetch ${modelName}`);
          yield slice;
        }
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: GraphQLState
  ): AsyncGenerator<Dictionary<any, string>, any, undefined> {
    const {query, incremental, queryPaths}: StreamSlice = streamSlice;
    this.logger.debug(`Processing query: "${query}"`);

    let stateKey = queryPaths.model.modelName;
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

        // No need to convert the V1 query to incremental
        // if it is going to be converted to V2 in the adapter.
        // We will convert to V2 incremental in the adapter
        if (!this.config.adapt_v1_query) {
          if (this.config.graphql_api === GraphQLVersion.V1) {
            modifiedQuery = toIncrementalV1(query);
          } else {
            modifiedQuery = toIncrementalV2(query);
          }
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

    let nodes: AsyncIterable<any>;
    if (this.config.adapt_v1_query) {
      const adapter = new QueryAdapter(this.faros, this.legacyV1Schema);
      nodes = adapter.nodes(
        this.config.graph,
        query,
        this.config.page_size || DEFAULT_PAGE_SIZE,
        args,
        // Convert the resulting V2 query to incremental in the adapter
        toIncrementalV2
      );
    } else {
      nodes = this.faros.nodeIterable(
        this.config.graph,
        modifiedQuery || query,
        this.config.page_size || DEFAULT_PAGE_SIZE,
        this.config.graphql_api === GraphQLVersion.V1
          ? paginatedQuery
          : paginatedQueryV2,
        args
      );
    }

    for await (const item of nodes) {
      const recordRefreshedAtMillis =
        this.config.graphql_api === GraphQLVersion.V1
          ? Number(item.metadata?.refreshedAt) || 0
          : new Date(item.refreshedAt).getTime() || 0;

      if (refreshedAtMillis < recordRefreshedAtMillis) {
        refreshedAtMillis = recordRefreshedAtMillis;
        this.state[stateKey] = {refreshedAtMillis};
      }

      if (this.nodes) {
        // Replace node IDs with keys
        const nodeIdPaths = queryPaths.nodeIds;
        for (const nodeIdPath of nodeIdPaths) {
          const nodeId = _.get(item, nodeIdPath);
          const rootNodeId = _.isEqual(nodeIdPath, ['id']);
          if (nodeId) {
            const key = this.nodes.decodeId(nodeId);
            if (!rootNodeId) {
              _.set(item, nodeIdPath.slice(0, -1), key);
            } else {
              _.merge(item, _.omitBy(key, _.isFunction));
            }
          }
          // Keep root node ID, but remove others
          if (!rootNodeId) {
            _.unset(item, nodeIdPath);
          }
        }
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
            [...queryPaths.model.path, 0]
          : queryPaths.model.modelName,
        result
      );
    }
  }

  getUpdatedState(): GraphQLState {
    return this.state;
  }
}
