import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PagerdutyConverter, PagerdutyObject} from './common';

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

export class Incidents extends PagerdutyConverter {
  private readonly logger = new AirbyteLogger();

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
      if (!incident.acknowledgements || !incident.acknowledgements.length) {
        this.logger.warn(
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
      // We are explicitly passing __Upsert command here with at := 0,
      // to allow updating Incident severity from prioritiesResource stream
      // in the same revision
      model: 'ims_Incident__Upsert',
      record: {
        at: 0,
        data: {
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

    const applicationMapping = this.applicationMapping(ctx);
    let application = {
      name: incident.service.summary,
      platform: '',
    };
    // if we have an app mapping specified
    if (
      incident.service.summary in applicationMapping &&
      applicationMapping[incident.service.summary].name
    ) {
      const mappedApp = applicationMapping[incident.service.summary];
      application = {
        name: mappedApp.name,
        platform: mappedApp.platform ?? application.platform,
      };
    }
    res.push({model: 'compute_Application', record: application});

    res.push({
      model: 'ims_IncidentApplicationImpact',
      record: {
        incident: incidentRef,
        application,
      },
    });

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
