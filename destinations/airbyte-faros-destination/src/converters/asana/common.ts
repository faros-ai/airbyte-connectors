import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, DestinationRecord} from '../converter';

export interface AsanaProject {
  gid: string;
  created_at: string;
  modified_at: string;
  name: string;
  notes: string;
  workspace: {
    gid: string;
    resource_type: string;
  };
}

export interface AsanaSection {
  gid: string;
  name: string;
  project?: AsanaProject;
}

export interface AsanaUser {
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

export type ProjectTaskAssociation = {
  project_gid: string;
  task_gid: string;
};

/** Common functions shares across Asana converters */
export class AsanaCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

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

  static tms_User(user: AsanaUser, source: string): DestinationRecord {
    return {
      model: 'tms_User',
      record: {
        uid: user.gid,
        name: user.name || null,
        emailAddress: user.email || null,
        source,
      },
    };
  }

  static tms_TaskBoard(
    section: AsanaSection,
    source: string
  ): DestinationRecord {
    return {
      model: 'tms_TaskBoard',
      record: {
        uid: section.gid,
        name: section.name,
        source,
      },
    };
  }
}

/** Asana converter base */
export abstract class AsanaConverter extends Converter {
  source = 'Asana';

  /** All Asana records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.gid;
  }
}
