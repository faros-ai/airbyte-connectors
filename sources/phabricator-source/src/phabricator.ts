import {Condoit} from 'condoit';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import _ from 'lodash';
import moment, {Moment} from 'moment';
import {VError} from 'verror';

export interface PhabricatorConfig {
  readonly server_url: string;
  readonly token: string;
  readonly start_date: string;
  readonly repositories: string;
}

export class Phabricator {
  constructor(
    private readonly client: Condoit,
    private readonly startDate: Moment,
    private readonly repositories: ReadonlyArray<string>,
    private readonly logger: AirbyteLogger
  ) {}

  static async make(
    config: PhabricatorConfig,
    logger: AirbyteLogger
  ): Promise<Phabricator> {
    if (!config.server_url) {
      throw new VError('server_url is null or empty');
    }
    if (!config.start_date) {
      throw new VError('start_date is null or empty');
    }
    const startDate = moment(config.start_date, moment.ISO_8601, true).utc();
    if (`${startDate.toDate()}` === 'Invalid Date') {
      throw new VError('start_date is invalid: %s', config.start_date);
    }
    const repositories = config.repositories
      ? config.repositories
          .split(' ')
          .map(_.trim)
          .filter((v) => v.length > 0)
      : [];
    const client = new Condoit(config.server_url, config.token);
    try {
      await client.user.whoami();
    } catch (err: any) {
      if (err.error_code || err.error_info) {
        throw new VError(`${err.error_code}: ${err.error_info}`);
      }
      throw new VError(err.message ?? JSON.stringify(err));
    }

    return new Phabricator(client, startDate, repositories, logger);
  }
}
