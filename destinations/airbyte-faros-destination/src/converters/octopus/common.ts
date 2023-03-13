import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

/** Octopus converter base */
export abstract class OctopusConverter extends Converter {
  source = 'Octopus';
  /** Almost every Octopus record have Id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.Id;
  }
}
