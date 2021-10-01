import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AsanaCommon, AsanaConverter} from './common';

// interface CustomField {
//   gid: string;
//   name: string;
//   text_value?: string;
//   number_value?: number;
//   enum_value: CustomFieldEnumValue;
//   multi_enum_values: CustomFieldEnumValue;
// }

// interface CustomFieldEnumValue {
//   name: string;
// }

// interface TmsTaskType {
//   category: TmsTaskCategory;
//   detail: string;
// }

// enum TmsTaskCategory {
//   Bug = 'Bug',
//   Custom = 'Custom',
//   Story = 'Story',
//   Task = 'Task',
// }

// interface TmsTaskStatus {
//   category: Tms_TaskStatusCategory;
//   detail: string;
// }

// enum Tms_TaskStatusCategory {
//   Custom = 'Custom',
//   Done = 'Done',
//   InProgress = 'InProgress',
//   Todo = 'Todo',
// }

export class AsanaTasks extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Task', 'tms_User'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const story = record.record.data;

    const creator = AsanaCommon.tms_User(story.created_by, source);

    res.push( {
      model: 'tms_Task',
      record: {
        uid: story.gid,
        name: story.source || undefined,
        description: story.text?.substring(
          0,
          AsanaCommon.MAX_DESCRIPTION_LENGTH
        ),
        type: AsanaCommon.toTmsTaskType(story.resource_type),
        createdAt: story.created_at,
        updatedAt: story.created_at,
        creator,
        source,
      },
    });
    res.push(creator);

    return res;
  }

  // private findFieldByName(
  //   customFields: CustomField[],
  //   compareName: string
  // ): undefined | string | number {
  //   for (const f of customFields) {
  //     const name = toLower(f.name);
  //     if (name === compareName) {
  //       return this.toTaskField(f).value;
  //     }
  //   }
  // }

  // private toTaskField(customField: CustomField): {
  //   name: string;
  //   value: undefined | string | number;
  // } {
  //   return {
  //     name: customField.name,
  //     value:
  //       customField.text_value ??
  //       customField.number_value ??
  //       customField.enum_value?.name ??
  //       customField.multi_enum_values?.name,
  //   };
  // }

  // private toTmsTaskType(type: string): TmsTaskType {
  //   const detail = toLower(type);
  //   switch (detail) {
  //     case 'bug':
  //       return {category: TmsTaskCategory.Bug, detail};
  //     case 'story':
  //       return {category: TmsTaskCategory.Story, detail};
  //     case 'task':
  //       return {category: TmsTaskCategory.Task, detail};
  //     default:
  //       return {category: TmsTaskCategory.Custom, detail};
  //   }
  // }

  // private toTmsTaskStatus(status: string): TmsTaskStatus {
  //   const detail = toLower(status);
  //   switch (detail) {
  //     case 'done':
  //       return {category: Tms_TaskStatusCategory.Done, detail};
  //     case 'inprogress':
  //       return {category: Tms_TaskStatusCategory.InProgress, detail};
  //     case 'todo':
  //       return {category: Tms_TaskStatusCategory.Todo, detail};
  //     default:
  //       return {category: Tms_TaskStatusCategory.Custom, detail};
  //   }
  // }
}
