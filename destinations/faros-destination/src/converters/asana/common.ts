import {AirbyteRecord} from 'faros-airbyte-cdk/src/protocol';

import {Converter, DestinationRecord} from '../converter';

export interface TmsUser {
  gid: string;
  name?: string;
  email?: string;
}

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

/** Common functions shares across Asana converters */
export class AsanaCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  static toTmsTaskType(type: string): TmsTaskType {
    const detail = type.toLowerCase();
    switch (detail) {
      case 'bug':
        return {category: TmsTaskCategory.Bug, detail};
      case 'story':
        return {category: TmsTaskCategory.Story, detail};
      case 'task':
        return {category: TmsTaskCategory.Task, detail};
      default:
        return {category: TmsTaskCategory.Custom, detail};
    }
  }

  static tms_User(user: TmsUser, source: string): DestinationRecord {
    return {
      model: 'tms_User',
      record: {
        uid: user.gid,
        name: user.name ?? null,
        emailAddress: user.email ?? undefined,
        source,
      },
    };
  }
}

/** Asana converter base */
export abstract class AsanaConverter extends Converter {
  /** All Asana records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.gid;
  }
}
