import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, DestinationRecord} from '../converter';
import {User} from './models';

interface TmsTaskType {
  category: TmsTaskCategory;
  detail: string;
}

enum TmsTaskCategory {
  Bug = 'Bug',
  Custom = 'Custom',
  Story = 'Story',
  Task = 'Task',
}

/** Common functions shares across Trello converters */
export class TrelloCommon {
  static normalize(str: string): string {
    return str.replace(/\s/g, '').toLowerCase();
  }

  static toTmsTaskType(resource_type: string): TmsTaskType {
    if (!resource_type) {
      return {category: TmsTaskCategory.Custom, detail: 'undefined'};
    }
    switch (this.normalize(resource_type)) {
      case 'bug':
        return {category: TmsTaskCategory.Bug, detail: resource_type};
      case 'story':
        return {category: TmsTaskCategory.Story, detail: resource_type};
      case 'task':
        return {category: TmsTaskCategory.Task, detail: resource_type};
      default:
        return {category: TmsTaskCategory.Custom, detail: resource_type};
    }
  }

  static tms_User(user: User, source: string): DestinationRecord {
    return {
      model: 'tms_User',
      record: {
        uid: user.id,
        name: user.fullName || null,
        emailAddress: user.username || null,
        source,
      },
    };
  }
}

/** Trello converter base */
export abstract class TrelloConverter extends Converter {
  source = 'Trello';

  /** All Trello records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
