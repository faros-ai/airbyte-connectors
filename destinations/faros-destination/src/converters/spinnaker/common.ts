import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Converter} from '../converter';

export type Application = Dictionary<any, string>;
export type Build = Dictionary<any, string>;
export type Execution = Dictionary<any, string>;
export type Pipeline = Dictionary<any, string>;
export type Job = Dictionary<any, string>;

/** Spinnaker converter base */
export abstract class SpinnakerConverter extends Converter {
  /** Every Spinnaker record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
