import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

interface XrayConfig {
  readonly jiraBaseUrl: string;
}

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new XraySource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class XraySource extends AirbyteSourceBase<XrayConfig> {
  get type(): string {
    return 'xray';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: XrayConfig): Promise<[boolean, VError]> {
    return [true, undefined];
  }
  streams(config: XrayConfig): AirbyteStreamBase[] {
    return [];
  }
}
