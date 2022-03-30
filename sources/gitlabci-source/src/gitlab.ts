import {Gitlab as GitlabClient} from '@gitbeaker/node';
import {AirbyteConfig, AirbyteLogger} from 'faros-airbyte-cdk/lib';
import {VError} from 'verror';

export interface GitlabConfig extends AirbyteConfig {
  readonly api_url: string;
  readonly token: string;
}

export class Gitlab {
  constructor(
    private readonly client: any,
    private readonly logger: AirbyteLogger
  ) {}

  static instance(config: GitlabConfig, logger: AirbyteLogger): Gitlab {
    if (!config.token) {
      throw new VError('token must be not an empty string');
    }
    if (!config.api_url) {
      throw new VError('api url must be not an empty string');
    }

    const client = new GitlabClient({token: config.token});

    logger.debug('Created Gitlab instance');

    return new Gitlab(client, logger);
  }

  async checkConnection(): Promise<void> {
    try {
      const projects = await this.client.Issues.all();
      console.log(projects);
    } catch (error: any) {
      const err = error?.message ?? JSON.stringify(error);
      console.log(error);
      throw new VError(
        `Please verify your api_url and token are correct. Error: ${err}`
      );
    }
  }
}
