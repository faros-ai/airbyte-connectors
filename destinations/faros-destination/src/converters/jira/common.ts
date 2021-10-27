import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export class JiraCommon {
  static POINTS_FIELD_NAMES = ['Story Points', 'Story point estimate'];
  static DEV_FIELD_NAME = 'Development';
  static EPIC_LINK_FIELD_NAME = 'Epic Link';
  static SPRINT_FIELD_NAME = 'Sprint';

  static normalize(str: string): string {
    return str.replace(/\s/g, '').toLowerCase();
  }
}

export const JiraStatusCategories: ReadonlyMap<string, string> = new Map(
  ['Todo', 'InProgress', 'Done'].map((s) => [JiraCommon.normalize(s), s])
);

export abstract class JiraConverter extends Converter {
  /** All Jira records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected useBoardOwnership: boolean =
    this.config.jira_use_board_ownership ?? false;
}
