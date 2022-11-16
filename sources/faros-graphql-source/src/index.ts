import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import VError from 'verror';

import {FarosGraph} from './streams';
export enum GraphQLVersion {
  V1 = 'v1',
  V2 = 'v2',
}

export interface GraphQLConfig extends AirbyteConfig {
  api_key: string;
  api_url: string;
  graph: string;
  graphql_api?: GraphQLVersion;
  page_size?: number;
  query?: string;
}

export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new FarosGraphSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class FarosGraphSource extends AirbyteSourceBase<GraphQLConfig> {
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
    if (!config.api_url) throw new VError('Faros API url was not provided');
    if (!config.api_key) throw new VError('Faros API key was not provided');
    if (!config.graphql_api)
      throw new VError('Faros GraphQL API version was not set');
    if (!config.graph) throw new VError('Faros graph name was not provided');
  }

  makeFarosClient(config: GraphQLConfig): FarosClient {
    this.validateConfig(config);

    const faros = new FarosClient({
      url: config.api_url,
      apiKey: config.api_key,
      useGraphQLV2: config.graphql_api === GraphQLVersion.V2,
    });

    return faros;
  }
}
