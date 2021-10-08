import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';
import {normalize} from '../utils';

export const JiraStatusCategories: ReadonlyMap<string, string> = new Map(
  ['Todo', 'InProgress', 'Done'].map((s) => [normalize(s), s])
);

export class JiraCommon {
  static POINTS_FIELD_NAMES = ['Story Points', 'Story point estimate'];
}

export abstract class JiraConverter extends Converter {
  /** All Jira records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected useBoardOwnership: boolean =
    this.config.jira_use_board_ownership ?? false;
}
