import {AirbyteRecord} from 'faros-airbyte-cdk';
import {camelCase, upperFirst} from 'lodash';

import {Converter} from '../converter';

export class JiraCommon {
  static POINTS_FIELD_NAMES = ['Story Points', 'Story point estimate'];

  static upperCamelCase(str: string): string {
    return upperFirst(camelCase(str));
  }
}
export abstract class JiraConverter extends Converter {
  /** All Jira records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
