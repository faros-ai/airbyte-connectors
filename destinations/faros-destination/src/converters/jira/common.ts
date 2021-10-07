import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export abstract class JiraConverter extends Converter {
  /** All Jira records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
