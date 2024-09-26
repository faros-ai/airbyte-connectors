import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Work} from './agileaccelerator_types';
import {
  AgileAcceleratorCommon,
  AgileAcceleratorConverter,
  TaskField,
} from './common';

export class Works extends AgileAcceleratorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Epic',
    'tms_Project',
    'tms_Sprint',
    'tms_Task',
    'tms_User',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const work = record.record.data as Work;
    const res: DestinationRecord[] = [];

    const maxDescriptionLength = this.maxDescriptionLength(ctx);

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
          description: Utils.cleanAndTruncate(
            work.agf__Epic__r.agf__Project__r.agf__Project_Management_Notes__c,
            maxDescriptionLength
          ),
          createdAt: AgileAcceleratorCommon.toDateTime(
            work.agf__Epic__r.agf__Project__r.CreatedDate
          ),
          updatedAt: AgileAcceleratorCommon.toDateTime(
            work.agf__Epic__r.agf__Project__r.LastModifiedDate
          ),
        },
      });
      res.push({
        model: 'tms_Epic',
        record: {
          ...epicRef,
          name: work.agf__Epic__r.Name,
          description: Utils.cleanAndTruncate(
            work.agf__Epic__r.agf__Description__c,
            maxDescriptionLength
          ),
          status: AgileAcceleratorCommon.toEpicStatus(
            work.agf__Epic__r.agf__Health__c
          ),
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
          state: AgileAcceleratorCommon.toSprintState(
            work.agf__Sprint__r.agf__Days_Remaining__c
          ),
          startedAt: AgileAcceleratorCommon.toDateTime(
            work.agf__Sprint__r.agf__Start_Date__c
          ),
          endedAt: AgileAcceleratorCommon.toDateTime(
            work.agf__Sprint__r.agf__End_Date__c,
            false
          ),
        },
      });
    }

    const additionalFields: TaskField[] = [];
    const workFieldNames = this.workAdditionalFields(ctx);
    for (const fieldName of workFieldNames) {
      const value = work[fieldName];
      if (value) {
        additionalFields.push(
          AgileAcceleratorCommon.toTaskField(fieldName, value)
        );
      }
    }

    const task = {
      uid: work.Id,
      name: work.Name,
      description: Utils.cleanAndTruncate(
        work.agf__Description__c,
        maxDescriptionLength
      ),
      url: work.baseUrl.concat(work.attributes.url),
      type: AgileAcceleratorCommon.toType(work.agf__Type__c),
      priority: work.agf__Priority__c,
      status: AgileAcceleratorCommon.toStatus(work.agf__Status__c),
      points: work.agf__Story_Points__c,
      additionalFields,
      createdAt: AgileAcceleratorCommon.toDateTime(work.CreatedDate),
      updatedAt: AgileAcceleratorCommon.toDateTime(work.LastModifiedDate),
      parent: {uid: work.agf__Parent_ID__c, source},
      creator: creatorRef,
      epic: epicRef,
      sprint: sprintRef,
      source,
    };

    res.push({model: 'tms_Task', record: task});

    return res;
  }
}
