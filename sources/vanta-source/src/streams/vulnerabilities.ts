import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Record, VulnerabilityRecordType} from 'faros-airbyte-common/vanta';
import {Dictionary} from 'ts-essentials';

import {VantaConfig} from '..';
import {Vanta} from '../vanta';

export class Vulnerabilities extends AirbyteStreamBase {
  constructor(
    private readonly cfg: VantaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/vulnerabilities.json');
  }
  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<Record> {
    const vanta = await Vanta.instance(this.cfg, this.logger);
    for await (const vuln of vanta.getVulnerabilities()) {
      yield {
        recordType: VulnerabilityRecordType.VULNERABILITY,
        data: vuln,
      };
    }
    for await (const vulnRemediation of vanta.getVulnerabilityRemediations()) {
      yield {
        recordType: VulnerabilityRecordType.VULNERABILITY_REMEDIATION,
        data: vulnRemediation,
      };
    }
  }
}
