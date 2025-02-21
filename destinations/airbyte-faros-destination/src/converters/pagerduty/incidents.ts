import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PagerDutyConverter, PagerdutyObject} from './common';

enum IncidentStatusCategory {
  Created = 'Created',
  Identified = 'Identified',
  Investigating = 'Investigating',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

type IncidentUrgency = 'high' | 'low'; //PagerDuty only has these two priorities
type IncidentState = 'triggered' | 'acknowledged' | 'resolved';

interface Acknowledgement {
  at: string; //date-time
  acknowledger: PagerdutyObject;
}

export class Incidents extends PagerDutyConverter {
  private seenApplications = new Set<string>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
    'ims_Incident',
    'ims_IncidentApplicationImpact',
    'ims_IncidentAssignment',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const incident = record.record.data;
    const res: DestinationRecord[] = [];
    const incidentRef = {uid: incident.id, source};
    const lastUpdated = Utils.toDate(incident.last_status_change_at);

    let acknowledgedAt, resolvedAt;
    if (incident.status === 'acknowledged') {
      if (!incident.acknowledgements?.length) {
        ctx.logger.warn(
          `Incident ${incident.id} acknowledged, but acknowledger info missing`
        );
      } else {
        // find first acknowledgement
        acknowledgedAt = Utils.toDate(
          incident.acknowledgements
            .map((ack: Acknowledgement) => ack.at)
            .sort()[0]
        );
      }
    } else if (incident.status === 'resolved') {
      resolvedAt = lastUpdated;
    }

    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentRef,
        title: incident.title,
        description: incident.description,
        url: incident.self,
        createdAt: Utils.toDate(incident.created_at),
        updatedAt: resolvedAt,
        acknowledgedAt: acknowledgedAt,
        resolvedAt: resolvedAt,
        priority: this.incidentPriority(incident.urgency),
        status: this.incidentState(incident.status),
      },
    });

    for (const assignment of incident.assignments) {
      const assignee = {uid: assignment.assignee.id, source};
      res.push({
        model: 'ims_IncidentAssignment',
        record: {
          incident: incidentRef,
          assignee,
        },
      });
    }

    if (incident?.service?.summary) {
      const applicationMapping = this.applicationMapping(ctx);
      const mappedApp = applicationMapping[incident.service.summary];
      const application = Common.computeApplication(
        mappedApp?.name ?? incident.service.summary,
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

    return res;
  }

  private incidentPriority(
    incidentUrgency: IncidentUrgency
  ): Record<string, string> {
    const detail = incidentUrgency;
    switch (incidentUrgency.toLowerCase()) {
      case 'high':
        return {category: 'High', detail};
      case 'low':
        return {category: 'Low', detail};
      default:
        return {category: 'Custom', detail};
    }
  }

  private incidentState(incidentStatus: IncidentState): {
    category: string;
    detail: string;
  } {
    const detail = incidentStatus;
    switch (incidentStatus) {
      case 'resolved':
        return {category: IncidentStatusCategory.Resolved, detail};
      case 'acknowledged':
        return {category: IncidentStatusCategory.Investigating, detail};
      case 'triggered':
      default:
        return {category: IncidentStatusCategory.Created, detail};
    }
  }
}
