// code for 'Vulns' class:
import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {VantaConfig} from '..';
import {Vanta} from '../vanta';

export class Vulns extends AirbyteStreamBase {
  constructor(
    private readonly cfg: VantaConfig,
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
    const vanta = await Vanta.instance(this.cfg, this.logger);
    for (const queryType of this.cfg.queryTypes) {
      this.logger.info(`Querying Vanta for ${queryType}`);
      for await (const record of vanta.vulns(queryType)) {
        yield {
          vuln_type: queryType,
          vuln_data: record,
        };
      }
    }
  }
}
