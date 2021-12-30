import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  EpicHealth,
  SpringDaysRemaining,
  Work,
  WorkStatus,
  WorkType,
} from './agileaccelerator_types';
import {AgileacceleratorCommon, AgileacceleratorConverter} from './common';

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

export class AgileacceleratorWorks extends AgileacceleratorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Epic',
    'tms_Project',
    'tms_Sprint',
    'tms_Task',
    'tms_User',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const work = record.record.data as Work;
    const res: DestinationRecord[] = [];

    let creatorRef = undefined;
    let epicRef = undefined;
    let sprintRef = undefined;
    if (work.CreatedBy) {
      creatorRef = {uid: work.CreatedBy.Id, source};
      res.push({
        model: 'tms_User',
        record: {
          ...creatorRef,
          emailAddress: work.CreatedBy.Email,
          name: work.CreatedBy.Name,
        },
      });
    }
    if (work.agf__Epic__r && work.agf__Epic__r.agf__Project__r) {
      epicRef = {uid: work.agf__Epic__r.Id, source};
      const projectRef = {uid: work.agf__Epic__r.agf__Project__r.Id, source};
      res.push({
        model: 'tms_Project',
        record: {
          ...projectRef,
          name: work.agf__Epic__r.agf__Project__r.Name,
          description:
            work.agf__Epic__r.agf__Project__r.agf__Project_Management_Notes__c?.substring(
              0,
              AgileacceleratorCommon.MAX_DESCRIPTION_LENGTH
            ),
          createdAt: this.toDateTime(
            work.agf__Epic__r.agf__Project__r.CreatedDate
          ),
          updatedAt: this.toDateTime(
            work.agf__Epic__r.agf__Project__r.LastModifiedDate
          ),
        },
      });
      res.push({
        model: 'tms_Epic',
        record: {
          ...epicRef,
          name: work.agf__Epic__r.Name,
          description: work.agf__Epic__r.agf__Description__c?.substring(
            0,
            AgileacceleratorCommon.MAX_DESCRIPTION_LENGTH
          ),
          status: this.toEpicStatus(work.agf__Epic__r.agf__Health__c),
          project: projectRef,
        },
      });
    }
    if (work.agf__Sprint__r) {
      sprintRef = {uid: work.agf__Sprint__r.Id, source};
      res.push({
        model: 'tms_Sprint',
        record: {
          ...sprintRef,
          name: work.agf__Sprint__r.Name,
          plannedPoints: work.agf__Sprint__r.agf__Committed_Points__c,
          completedPoints: work.agf__Sprint__r.agf__Completed_Story_Points__c,
          state: this.toSprintState(work.agf__Sprint__r.agf__Days_Remaining__c),
          startedAt: this.toDateTime(work.agf__Sprint__r.agf__Start_Date__c),
          endedAt: this.toDateTime(work.agf__Sprint__r.agf__End_Date__c),
        },
      });
    }

    const task = {
      uid: work.Id,
      name: work.Name,
      description: work.agf__Description__c?.substring(
        0,
        AgileacceleratorCommon.MAX_DESCRIPTION_LENGTH
      ),
      url: work.baseUrl.concat(work.attributes.url),
      type: this.toType(work.agf__Type__c),
      priority: work.agf__Priority__c,
      status: this.toStatus(work.agf__Status__c),
      points: work.agf__Story_Points__c,
      // TODO:  "Stores additional fields not explicitly tracked by the model"
      // additionalFields: [tms_TaskField]
      createdAt: this.toDateTime(work.CreatedDate),
      updatedAt: this.toDateTime(work.LastModifiedDate),
      parent: {uid: work.agf__Parent_ID__c, source},
      creator: creatorRef,
      epic: epicRef,
      sprint: sprintRef,
      source,
    };

    res.push({model: 'tms_Task', record: task});

    return res;
  }

  private toDateTime(date: string, isStart = true): Date {
    const hours = isStart ? '00' : '24';
    const dateString = date.includes('T')
      ? date
      : date.concat(`T${hours}:00:00.000+0000`);
    return Utils.toDate(dateString);
  }

  private toStatus(type: WorkStatus): TaskStatus {
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

  private toType(type: WorkType): TaskType {
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

  private toEpicStatus(health: EpicHealth): EpicStatus {
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

  private toSprintState(daysRemaining: SpringDaysRemaining): SprintState {
    const detail: string = daysRemaining;
    switch (detail) {
      case SpringDaysRemaining.CLOSED:
        return SprintState.Closed;
      case SpringDaysRemaining.NOT_STARTED:
        return SprintState.Future;
    }
  }
}
