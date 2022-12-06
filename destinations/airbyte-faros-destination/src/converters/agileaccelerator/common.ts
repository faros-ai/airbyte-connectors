import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Converter, StreamContext} from '../converter';
import {
  EpicHealth,
  SpringDaysRemaining,
  WorkStatus,
  WorkType,
} from './agileaccelerator_types';

const MAX_DESCRIPTION_LENGTH = 1000;

export type TaskField = {
  name: string;
  value: string;
};

type EpicStatus = {
  category: EpicStatusCategory;
  detail: string;
};

enum SprintState {
  Active = 'Active',
  Closed = 'Closed',
  Future = 'Future',
}

type TaskType = {
  category: TaskCategory;
  detail: string;
};

type TaskStatus = {
  category: TaskStatusCategory;
  detail: string;
};

enum EpicStatusCategory {
  Custom = 'Custom',
  Done = 'Done',
  InProgress = 'InProgress',
  Todo = 'Todo',
}

enum TaskCategory {
  Bug = 'Bug',
  Custom = 'Custom',
  Story = 'Story',
  Task = 'Task',
}

enum TaskStatusCategory {
  Custom = 'Custom',
  Done = 'Done',
  InProgress = 'InProgress',
  Todo = 'Todo',
}

interface AgileAcceleratorConfig {
  // Max length for free-form description text fields such as works description
  max_description_length?: number;
  work_additional_fields?: string[];
}

export class AgileAcceleratorCommon {
  static toDateTime(date: string, isStart = true): Date {
    const hours = isStart ? '00' : '24';
    const dateString = date.includes('T')
      ? date
      : date.concat(`T${hours}:00:00.000+0000`);
    return Utils.toDate(dateString);
  }

  static toStatus(type: WorkStatus): TaskStatus {
    const detail: string = type;
    switch (detail) {
      case WorkStatus.New:
      case WorkStatus.Deferred:
      case WorkStatus.Acknowledged:
      case WorkStatus.Ready_for_Review:
      case WorkStatus.Waiting:
        return {category: TaskStatusCategory.Todo, detail};
      case WorkStatus.Triaged:
      case WorkStatus.In_Progress:
      case WorkStatus.Investigating:
      case WorkStatus.QA_In_Progress:
      case WorkStatus.Pending_Release:
        return {category: TaskStatusCategory.InProgress, detail};
      case WorkStatus.Closed:
      case WorkStatus.Closed_Defunct:
      case WorkStatus.Closed_Duplicate:
      case WorkStatus.Closed_Eng_Internal:
      case WorkStatus.Closed_Known_Bug_Exists:
      case WorkStatus.Closed_New_Bug_Logged:
      case WorkStatus.Closed_LAP_Request_Approved:
      case WorkStatus.Closed_LAP_Request_Denied:
      case WorkStatus.Closed_Resolved_With_Internal_Tools:
      case WorkStatus.Closed_Resolved_Without_Code_Change:
      case WorkStatus.Closed_No_Fix_Working_as_Designed:
      case WorkStatus.Closed_No_Fix_Feature_Request:
      case WorkStatus.Closed_No_Fix_Will_Not_Fix:
      case WorkStatus.Fixed:
      case WorkStatus.Eng_Internal:
      case WorkStatus.Completed:
        return {category: TaskStatusCategory.Done, detail};
      case WorkStatus.Duplicate:
      case WorkStatus.Inactive:
      case WorkStatus.More_Info_Reqd_from_Support:
      case WorkStatus.Never:
      case WorkStatus.Not_a_bug:
      case WorkStatus.Not_Reproducible:
      case WorkStatus.Rejected:
      case WorkStatus.Integrate:
      default:
        return {category: TaskStatusCategory.Custom, detail};
    }
  }

  static toType(type: WorkType): TaskType {
    const detail: string = type;
    switch (detail) {
      case WorkType.Bug:
      case WorkType.Bug_List:
      case WorkType.Test_Case:
      case WorkType.Test_Failure:
        return {category: TaskCategory.Bug, detail};
      case WorkType.Help:
        return {category: TaskCategory.Story, detail};
      case WorkType.Integrate:
      case WorkType.Test_Change:
      case WorkType.Test_Tool:
        return {category: TaskCategory.Task, detail};
      case WorkType.Non_Deterministic_Test:
      case WorkType.Skunkforce:
      case WorkType.Translation:
      case WorkType.Gack:
      default:
        return {category: TaskCategory.Custom, detail};
    }
  }

  static toEpicStatus(health: EpicHealth): EpicStatus {
    const detail: string = health;
    switch (detail) {
      case EpicHealth.Not_Started:
        return {category: EpicStatusCategory.Todo, detail};
      case EpicHealth.On_Hold:
      case EpicHealth.Watch:
      case EpicHealth.Blocked:
      case EpicHealth.On_Track:
        return {category: EpicStatusCategory.InProgress, detail};
      case EpicHealth.Completed:
        return {category: EpicStatusCategory.Done, detail};
      case EpicHealth.Canceled:
      case EpicHealth.Green:
      case EpicHealth.Yellow:
      case EpicHealth.Red:
      default:
        return {category: EpicStatusCategory.Custom, detail};
    }
  }

  static toSprintState(daysRemaining: SpringDaysRemaining): SprintState {
    const detail: string = daysRemaining;
    switch (detail) {
      case SpringDaysRemaining.CLOSED:
        return SprintState.Closed;
      case SpringDaysRemaining.NOT_STARTED:
        return SprintState.Future;
    }
  }

  static toTaskField(name: string, value: string): TaskField {
    return {name, value};
  }
}

/** AgileAccelerator converter base */
export abstract class AgileAcceleratorConverter extends Converter {
  source = 'AgileAccelerator';

  /** Almost every AgileAccelerator record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.Id;
  }

  protected agileacceleratorConfig(ctx: StreamContext): AgileAcceleratorConfig {
    return ctx.config.source_specific_configs?.agileaccelerator ?? {};
  }

  protected maxDescriptionLength(ctx: StreamContext): number {
    return (
      this.agileacceleratorConfig(ctx).max_description_length ??
      MAX_DESCRIPTION_LENGTH
    );
  }

  protected workAdditionalFields(ctx: StreamContext): string[] {
    return this.agileacceleratorConfig(ctx).work_additional_fields ?? [];
  }
}
