import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {FireHydrantConverter} from './common';
import {IncidentTicket} from './models';
import {
  FirehydrantIncidentMilestone,
  FirehydrantIncidentPriority,
  FirehydrantIncidentSeverity,
  Incident,
  IncidentEventType,
  IncidentEventTypeCategory,
  IncidentPriority,
  IncidentPriorityCategory,
  IncidentSeverity,
  IncidentSeverityCategory,
  IncidentStatusCategory,
  IncidentTicketState,
  TaskStatus,
  TaskStatusCategory,
} from './models';

export class Incidents extends FireHydrantConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
    'ims_Incident',
    'ims_IncidentApplicationImpact',
    'ims_IncidentAssignment',
    'ims_IncidentEvent',
    'ims_IncidentTag',
    'ims_IncidentTasks',
    'ims_Label',
    'tms_Task',
  ];

  private seenTags = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const incident = record.record.data as Incident;
    const res: DestinationRecord[] = [];

    const maxDescriptionLength = this.maxDescriptionLength(ctx);

    const applicationMapping = this.applicationMapping(ctx);
    const incidentRef = {uid: incident.id, source};
    const createdAt = Utils.toDate(incident.created_at);
    const updatedAt = incident.events
      ? Utils.toDate(incident.events[incident.events.length - 1].occurred_at)
      : createdAt;

    let acknowledgedAt: Date = undefined;
    let resolvedAt: Date = undefined;

    for (const event of incident.events) {
      const eventType: IncidentEventType = {
        category: IncidentEventTypeCategory.Created,
        detail: event.type,
      };

      const occurredAt = Utils.toDate(event.occurred_at);
      if (
        !resolvedAt &&
        event.data.current_milestone === FirehydrantIncidentMilestone.resolved
      ) {
        resolvedAt = occurredAt;
        eventType.category = IncidentEventTypeCategory.Resolved;
      }
      if (
        !acknowledgedAt &&
        event.data.current_milestone ===
          FirehydrantIncidentMilestone.acknowledged
      ) {
        acknowledgedAt = occurredAt;
        eventType.category = IncidentEventTypeCategory.Acknowledged;
      }
      res.push({
        model: 'ims_IncidentEvent',
        record: {
          uid: event.id,
          type: eventType,
          incident: incidentRef,
          detail: JSON.stringify(event.data),
          createdAt: occurredAt,
        },
      });

      if (event.data.operation === 'created' && event.data.ticket) {
        const ticket = event.data.ticket as IncidentTicket;
        // TODO
        res.push(
          this.getTaskDestinationRecord(
            ticket,
            source,
            maxDescriptionLength,
            occurredAt
          )
        );
        const task = {uid: ticket.id, source};
        res.push({
          model: 'ims_IncidentTasks',
          record: {
            task,
            incident: incidentRef,
          },
        });
      }
    }

    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentRef,
        title: incident.name,
        description: incident.description?.substring(0, maxDescriptionLength),
        url: incident.incident_url,
        createdAt,
        updatedAt,
        acknowledgedAt,
        resolvedAt,
        priority: this.getPriority(incident.priority),
        severity: this.getSeverity(incident.severity),
        status: this.getIncidentStatus(incident.current_milestone),
      },
    });

    for (const service of incident.services) {
      if (
        service.name in applicationMapping &&
        applicationMapping[service.name].name
      ) {
        const mappedApp = applicationMapping[service.name];
        const application = {
          name: mappedApp.name,
          platform: mappedApp.platform ?? '',
        };
        res.push({model: 'compute_Application', record: application});
        res.push({
          model: 'ims_IncidentApplicationImpact',
          record: {
            incident: incidentRef,
            application,
          },
        });
      }
    }

    for (const assignment of incident.role_assignments) {
      const assignee = {uid: assignment.user.id, source};
      res.push({
        model: 'ims_IncidentAssignment',
        record: {
          assignee,
          incident: incidentRef,
        },
      });
    }

    for (const tag of incident.tag_list) {
      if (!this.seenTags.has(tag)) {
        this.seenTags.add(tag);
        res.push({
          model: 'ims_Label',
          record: {
            name: tag,
          },
        });
      }
      res.push({
        model: 'ims_IncidentTag',
        record: {
          label: {name: tag},
          incident: incidentRef,
        },
      });
    }
    return res;
  }

  private getTaskDestinationRecord(
    ticket: IncidentTicket,
    source: string,
    maxDescriptionLength: number,
    occurredAt: Date
  ): DestinationRecord {
    return {
      model: 'tms_Task',
      record: {
        uid: ticket.id,
        name: ticket.summary,
        description: ticket.description?.substring(0, maxDescriptionLength),
        source,
        url: undefined,
        type: {
          detail: ticket.type,
          category: 'Task',
        },
        priority: undefined,
        status: this.getTaskStatus(ticket.state),
        points: 0,
        additionalFields: [],
        createdAt: occurredAt,
        updatedAt: occurredAt,
        statusChangedAt: undefined,
        statusChangelog: undefined,
        parent: undefined,
        creator: {uid: ticket.created_by.id, source},
        epic: undefined,
        sprint: undefined,
      },
    };
  }
  private getPriority(priority: string): IncidentPriority {
    const detail: string = priority;
    switch (priority) {
      case FirehydrantIncidentPriority.P1:
        return {category: IncidentPriorityCategory.Critical, detail};
      case FirehydrantIncidentPriority.P2:
        return {category: IncidentPriorityCategory.High, detail};
      case FirehydrantIncidentPriority.P3:
        return {category: IncidentPriorityCategory.Medium, detail};
      case FirehydrantIncidentPriority.P4:
        return {category: IncidentPriorityCategory.Low, detail};
      default:
        return {category: IncidentPriorityCategory.Custom, detail};
    }
  }

  private getSeverity(severity: string): IncidentSeverity {
    const detail: string = severity;
    switch (severity) {
      case FirehydrantIncidentSeverity.SEV1:
        return {category: IncidentSeverityCategory.Sev1, detail};
      case FirehydrantIncidentSeverity.SEV2:
        return {category: IncidentSeverityCategory.Sev2, detail};
      case FirehydrantIncidentSeverity.SEV3:
        return {category: IncidentSeverityCategory.Sev3, detail};
      case FirehydrantIncidentSeverity.SEV4:
        return {category: IncidentSeverityCategory.Sev4, detail};
      case FirehydrantIncidentSeverity.SEV5:
        return {category: IncidentSeverityCategory.Sev5, detail};
      default:
        return {category: IncidentSeverityCategory.Custom, detail};
    }
  }

  //https://support.firehydrant.io/hc/en-us/articles/4403969187604-Incident-Milestones
  private getIncidentStatus(milestone: string): {
    category: string;
    detail: string;
  } {
    const detail = milestone;
    switch (milestone) {
      case FirehydrantIncidentMilestone.started:
        return {category: IncidentStatusCategory.Investigating, detail};
      case FirehydrantIncidentMilestone.detected:
        return {category: IncidentStatusCategory.Identified, detail};
      case FirehydrantIncidentMilestone.acknowledged:
      case FirehydrantIncidentMilestone.firstaction:
        return {category: IncidentStatusCategory.Monitoring, detail};
      case FirehydrantIncidentMilestone.mitigated:
      case FirehydrantIncidentMilestone.resolved:
        return {category: IncidentStatusCategory.Resolved, detail};
      default:
        return {category: IncidentStatusCategory.Custom, detail};
    }
  }

  private getTaskStatus(status: string): TaskStatus {
    const detail: string = status;
    switch (status) {
      case IncidentTicketState.open:
        return {category: TaskStatusCategory.Todo, detail};
      case IncidentTicketState.in_progress:
        return {category: TaskStatusCategory.InProgress, detail};
      case IncidentTicketState.done:
        return {category: TaskStatusCategory.Done, detail};
      default:
        return {category: TaskStatusCategory.Custom, detail};
    }
  }
}
