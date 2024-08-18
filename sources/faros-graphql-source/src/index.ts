import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import VError from 'verror';

import {FarosGraph} from './streams';
import {DEFAULT_BUCKET_ID, DEFAULT_BUCKET_TOTAL} from './streams/faros-graph';
export enum GraphQLVersion {
  V1 = 'v1',
  V2 = 'v2',
}

export enum ResultModel {
  Nested = 'Nested',
  Flat = 'Flat',
}

export interface GraphQLConfig extends AirbyteConfig {
  api_key: string;
  api_url?: string;
  graph: string;
  graphql_api?: GraphQLVersion;
  page_size?: number;
  query?: string;
  models_filter?: ReadonlyArray<string>;
  result_model?: ResultModel;
  adapt_v1_query?: boolean;
  legacy_v1_schema?: string;
  bucket_id?: number;
  bucket_total?: number;
}

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new FarosGraphSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

const DEFAULT_API_URL = 'https://prod.api.faros.ai';

export class FarosGraphSource extends AirbyteSourceBase<GraphQLConfig> {
  get type(): string {
    return 'faros-graphql';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: GraphQLConfig): Promise<[boolean, VError]> {
    try {
      const faros = this.makeFarosClient(config);

      if (!(await faros.graphExists(config.graph))) {
        return [false, new VError(`Graph ${config.graph} does not exist!`)];
      }
    } catch (err: any) {
      return [false, err as VError];
    }

    return [true, undefined];
  }

  streams(config: GraphQLConfig): AirbyteStreamBase[] {
    return [new FarosGraph(config, this.logger, this.makeFarosClient(config))];
  }

  validateConfig(config: GraphQLConfig): void {
    if (!config.api_key) throw new VError('Faros API key was not provided');
    if (!config.graph) throw new VError('Faros graph name was not provided');
    if (config.result_model === undefined)
      throw new VError('Result model was not provided');
    if (config.adapt_v1_query) {
      if (!config.legacy_v1_schema)
        throw new VError('Legacy V1 schema was not provided');
      if (!config.query) throw new VError('GraphQL query was not provided');
      if ((config.graphql_api ?? 'v2') !== GraphQLVersion.V2)
        throw new VError(
          `GraphQL API version should be ${GraphQLVersion.V2}` +
            " when 'Adapt V1 query' is enabled"
        );
    }

    if (config.query) {
      if (config.bucket_id !== undefined)
        throw new VError('Bucket id cannot be used in combination with query');
      if (config.bucket_total !== undefined)
        throw new VError(
          'Bucket total cannot be used in combination with query'
        );
    }

    const bucket_id = config.bucket_id ?? DEFAULT_BUCKET_ID;
    const bucket_total = config.bucket_total ?? DEFAULT_BUCKET_TOTAL;
    if (bucket_id <= 0) throw new VError('Bucket id must be positive');
    if (bucket_total <= 0) throw new VError('Bucket total must be positive');
    if (bucket_id > bucket_total)
      throw new VError(
        `Bucket id (${bucket_id}) cannot be larger than Bucket total (${bucket_total})`
      );
  }

  makeFarosClient(config: GraphQLConfig): FarosClient {
    this.validateConfig(config);

    const faros = new FarosClient({
      url: config.api_url ?? DEFAULT_API_URL,
      apiKey: config.api_key,
    });

    return faros;
  }
}
