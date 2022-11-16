import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
  Spec,
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
      if (!config.api_url) throw new VError('Missing api_url');
      if (!config.api_key) throw new VError('Missing api_key');
      if (!config.graphql_api) throw new VError('Missing graphql_api');
      if (!config.graph) throw new VError('Missing graph');

      const faros = new FarosClient({
        url: config.api_url,
        apiKey: config.api_key,
        useGraphQLV2: config.graphql_api === GraphQLVersion.V2,
      });
      if (!(await faros.graphExists(config.graph))) {
        return [false, new VError('Graph does not exist!')];
      }
    } catch (err: any) {
      return [false, err as VError];
    }
    return [true, undefined];
  }
  streams(config: GraphQLConfig): AirbyteStreamBase[] {
    return [new FarosGraph(config, this.logger)];
  }
}
