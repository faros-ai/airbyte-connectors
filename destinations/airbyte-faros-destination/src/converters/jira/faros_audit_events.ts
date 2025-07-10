import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Version2Models} from 'jira.js';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosAuditEvents extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const auditRecord = record.record.data as Version2Models.AuditRecord;
    const source = this.initializeSource(ctx);

    // Only process ISSUE_DELETE events
    if (auditRecord.objectItem?.typeName !== 'ISSUE_DELETE') {
      return [];
    }

    const issueKey = this.extractIssueKey(auditRecord);
    if (!issueKey) {
      return [];
    }

    const taskReference = {uid: issueKey, source};
    const models = [
      {model: 'tms_TaskAssignment__Deletion', where: {task: taskReference}},
      {model: 'tms_TaskDependency__Deletion', where: {dependentTask: taskReference}},
      {model: 'tms_TaskDependency__Deletion', where: {fulfillingTask: taskReference}},
      {model: 'tms_TaskProjectRelationship__Deletion', where: {task: taskReference}},
      {model: 'tms_TaskBoardRelationship__Deletion', where: {task: taskReference}},
      {model: 'tms_TaskPullRequestAssociation__Deletion', where: {task: taskReference}},
      {model: 'tms_TaskReleaseRelationship__Deletion', where: {task: taskReference}},
      {model: 'tms_TaskTag__Deletion', where: {task: taskReference}},
      {model: 'tms_SprintHistory__Deletion', where: {task: taskReference}},
      {model: 'tms_SprintReport__Deletion', where: {sprintHistory: {task: taskReference}}},
      {model: 'tms_Epic__Deletion', where: taskReference},
      {model: 'tms_Task__Deletion', where: taskReference}, // Main task
    ];

    return models.map(({model, where}) => this.createDeletionRecord(model, where));
  }

  private createDeletionRecord(model: string, where: object): DestinationRecord {
    return {
      model,
      record: {
        flushRequired: false,
        where,
      },
    };
  }

  private extractIssueKey(
    auditRecord: Version2Models.AuditRecord
  ): string | undefined {
    return auditRecord.objectItem?.name;
  }
}
