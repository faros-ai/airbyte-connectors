import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {WorkdayConfig} from '..';
import {Workday} from '../workday';

export class Customreports extends AirbyteStreamBase {
  constructor(
    private readonly cfg: WorkdayConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/customreports.json');
  }
  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<Dictionary<any>> {
    const workday = await Workday.instance(this.cfg, this.logger);
    if (this.cfg.customReportName) {
      yield* workday.customReports(
        this.cfg.customReportName,
        this.cfg.reportFormat.toLowerCase()
      );
    } else {
      this.logger.warn('No custom report name provided. Skipping...');
    }
  }
}
