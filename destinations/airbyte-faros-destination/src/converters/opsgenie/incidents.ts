import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OpsGenieConverter} from './common';
import {
  Incident,
  IncidentEventType,
  IncidentEventTypeCategory,
  IncidentPriority,
  IncidentPriorityCategory,
  IncidentStatus,
  IncidentStatusCategory,
  OpsGenieIncidentPriority,
} from './models';

export class Incidents extends OpsGenieConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
    'ims_Incident',
    'ims_IncidentApplicationImpact',
    'ims_IncidentAssignment',
    'ims_IncidentEvent',
    'ims_IncidentTag',
    'ims_Label',
    'ims_TeamIncidentAssociation',
  ];

  private seenTags = new Set<string>();
  private seenApplications = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const incident = record.record.data as Incident;
    const res: DestinationRecord[] = [];

    const maxDescriptionLength = this.maxDescriptionLength(ctx);

    const incidentRef = {uid: incident.id, source};
    const createdAt = Utils.toDate(incident.createdAt);
    const updatedAt = Utils.toDate(incident.updatedAt);

    let acknowledgedAt: Date = undefined;
    let resolvedAt: Date = undefined;

    for (const event of incident.timelines) {
      const eventType: IncidentEventType = {
        category: IncidentEventTypeCategory.Created,
        detail: event.type,
      };

      const eventTime = Utils.toDate(event.eventTime);
      if (!resolvedAt && event.type === 'IncidentResolved') {
        resolvedAt = eventTime;
        eventType.category = IncidentEventTypeCategory.Resolved;
      }
      if (!acknowledgedAt && event.type === 'ResponderAlertAcked') {
        acknowledgedAt = eventTime;
        eventType.category = IncidentEventTypeCategory.Acknowledged;
      }
      res.push({
        model: 'ims_IncidentEvent',
        record: {
          uid: event.id,
          type: eventType,
          incident: incidentRef,
          detail: event.title?.content,
          createdAt: eventTime,
        },
      });
    }
    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentRef,
        title: incident.message,
        description: Utils.cleanAndTruncate(
          incident.description,
          maxDescriptionLength
        ),
        url: incident.links?.web,
        createdAt,
        updatedAt,
        acknowledgedAt,
        resolvedAt,
        priority: this.getPriority(incident.priority),
        status: this.getIncidentStatus(incident.status),
      },
    });

    if (incident.impactedServices) {
      const applicationMapping = this.applicationMapping(ctx);
      for (const service of incident.impactedServices) {
        if (!service) continue;
        const mappedApp = applicationMapping[service];
        const application = Common.computeApplication(
          mappedApp?.name ?? service,
          mappedApp?.platform
        );
        const appKey = application.uid;
        if (!this.seenApplications.has(appKey)) {
          res.push({model: 'compute_Application', record: application});
          this.seenApplications.add(appKey);
        }
        res.push({
          model: 'ims_IncidentApplicationImpact',
          record: {incident: incidentRef, application},
        });
      }
    }

    for (const responder of incident.responders) {
      const assignee = {uid: responder.id, source};
      if (responder.type === 'user') {
        res.push({
          model: 'ims_IncidentAssignment',
          record: {
            assignee,
            incident: incidentRef,
          },
        });
      } else {
        res.push({
          model: 'ims_TeamIncidentAssociation',
          record: {
            team: assignee,
            incident: incidentRef,
          },
        });
      }
    }

    for (const tag of incident.tags) {
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

  private getPriority(priority: string): IncidentPriority {
    const detail: string = priority;
    switch (priority) {
      case OpsGenieIncidentPriority.P1:
        return {category: IncidentPriorityCategory.Critical, detail};
      case OpsGenieIncidentPriority.P2:
        return {category: IncidentPriorityCategory.High, detail};
      case OpsGenieIncidentPriority.P3:
        return {category: IncidentPriorityCategory.Medium, detail};
      case OpsGenieIncidentPriority.P4:
        return {category: IncidentPriorityCategory.Low, detail};
      default:
        return {category: IncidentPriorityCategory.Custom, detail};
    }
  }

  private getIncidentStatus(status: string): {
    category: string;
    detail: string;
  } {
    const detail = status;
    switch (status) {
      case IncidentStatus.open:
        return {category: IncidentStatusCategory.Investigating, detail};
      case IncidentStatus.resolved:
        return {category: IncidentStatusCategory.Resolved, detail};
      case IncidentStatus.closed:
      default:
        return {category: IncidentStatusCategory.Custom, detail};
    }
  }
}
