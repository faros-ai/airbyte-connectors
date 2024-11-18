import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export abstract class VantaConverter extends Converter {
  source = 'Vanta';

  // Severity mapping from https://nvd.nist.gov/vuln-metrics/cvss
  severityMap: {[key: string]: number} = {
    LOW: 3.0,
    MEDIUM: 6.0,
    HIGH: 9.0,
    CRITICAL: 10.0,
  };

  /** All Vanta records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
