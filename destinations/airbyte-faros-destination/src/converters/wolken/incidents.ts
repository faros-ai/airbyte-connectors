import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  IncidentPriorityCategory,
  IncidentStatusCategory,
} from '../common/ims';
import {Incident} from 'faros-airbyte-common/wolken';
import {WolkenConverter} from './common';


export class Incidents extends WolkenConverter {
  id(record: AirbyteRecord) {
    return record?.record?.data?.ticketId;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Incident',
    'ims_IncidentAssignment',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const incident = record.record.data as Incident;

    const incidentKey = {
      uid: incident.ticketId,
      source,
    };

    const res = [];

    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentKey,
        title: incident.subject,
        description: Utils.cleanAndTruncate(incident.description),
        // TODO: Add severity
        priority: this.getPriority(incident.priorityName) ?? null,
        status: this.getStatus(incident.statusName) ?? null,
        createdAt: Utils.toDate(incident.createdTime) ?? null,
        updatedAt: Utils.toDate(incident.updatedTimestamp) ?? null,
        resolvedAt: Utils.toDate(incident.resolutionTimeStamp) ?? null,
      },
    });

    const assigneeUid = incident.assignedUserId;
    if (assigneeUid) {
      res.push({
        model: 'ims_IncidentAssignment',
        record: {
          incident: incidentKey,
          assignee: {
            uid: assigneeUid,
            source,
          },
        },
      });
    }

    return res;
  }

  private getPriority(
    priorityName?: string
  ): {category: IncidentPriorityCategory; detail: string} | undefined {
    if (!isNil(priorityName)) {
      return Utils.toCategoryDetail(IncidentPriorityCategory, priorityName, {
        'Critical - P1': IncidentPriorityCategory.Critical,
        'High - P2': IncidentPriorityCategory.High,
        'Medium - P3': IncidentPriorityCategory.Medium,
        'Low - P4': IncidentPriorityCategory.Low
      });
    }
    return undefined;
  }

  private getStatus(
    statusName?: string
  ): {category: IncidentStatusCategory; detail: string} | undefined {
    if (!isNil(statusName)) {
      return Utils.toCategoryDetail(IncidentStatusCategory, statusName, {
        'Closed': IncidentStatusCategory.Resolved,
        'In Progress': IncidentStatusCategory.Investigating,
        'Open': IncidentStatusCategory.Created,
        'Reopen': IncidentStatusCategory.Identified,
        'Resolved': IncidentStatusCategory.Resolved,
        'Waiting': IncidentStatusCategory.Identified,
      });
    }
    return undefined;
  }
}

