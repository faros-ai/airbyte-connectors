import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export interface PagerdutyObject {
  readonly id: string;
  readonly type: string; // object type of the form <name>_reference
  readonly summary: string; // human readable summary
  readonly self: string; // API discrete resource url
  readonly html_url: string; // Pagerduty web url
}

/** Pagerduty converter base */
export abstract class PagerdutyConverter extends Converter {
  /** Almost every Pagerduty record have id property. Function will be
   * override if record doesn't have id property.
   */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
