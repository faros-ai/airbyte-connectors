import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {VictorOpsConverter} from './common';

enum IncidentStatusCategory {
  Created = 'Created',
  Identified = 'Identified',
  Investigating = 'Investigating',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

enum IncidentSeverityCategory {
  Sev1 = 'Sev1',
  Sev2 = 'Sev2',
  Sev3 = 'Sev3',
  Sev4 = 'Sev4',
  Sev5 = 'Sev5',
  Custom = 'Custom',
}

interface IncidentEventType {
  category: IncidentEventTypeCategory;
  detail: string;
}

enum IncidentEventTypeCategory {
  Created = 'Created',
  Acknowledged = 'Acknowledged',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

type IncidentPhase =
  | 'RESOLVED'
  | 'UNACKED'
  | 'ACKED'
  | 'triggered'
  | 'acknowledged'
  | 'resolved';

export class Incidents extends VictorOpsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
    'ims_Incident',
    'ims_IncidentApplicationImpact',
    'ims_IncidentAssignment',
    'ims_IncidentEvent',
    'ims_TeamIncidentAssociation',
  ];

  private seenApplications = new Set<string>();

  id(record: AirbyteRecord): any {
    return record?.record?.data?.incidentNumber;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const incident = record.record.data;
    const res: DestinationRecord[] = [];

    const incidentRef = {uid: incident.incidentNumber, source};
    const createdAt = Utils.toDate(incident.startTime);
    //VO has service states, e.g. CRITICAL
    let severity = incident.entityState
      ? this.getSeverity(incident.entityState)
      : undefined;

    let acknowledgedAt: Date | undefined = undefined,
      resolvedAt: Date | undefined = undefined,
      updatedAt = Utils.toDate(incident.startTime);

    for (const transition of incident.transitions) {
      const transitionTime = Utils.toDate(transition.at);

      res.push({
        model: 'ims_IncidentEvent',
        record: {
          uid: `${transition.name}_${transition.at}`,
          type: this.eventType(transition.name),
          createdAt: transitionTime,
          detail: transition.message ?? incident.entityDisplayName,
          incident: incidentRef,
        },
      });

      if (['ACKED', 'acknowledged'].includes(transition.name)) {
        //use earliest acknowledgement
        if (!acknowledgedAt || transitionTime < acknowledgedAt) {
          acknowledgedAt = transitionTime;
        }
      }
      
      if (transition.by) {
        res.push({
          model: 'ims_IncidentAssignment',
          record: {
            incident: incidentRef,
            assignee: {
              uid: transition.by,
              source,
            },
            assignedAt: transitionTime,
          },
        });
      }

      if (transition.name.toLowerCase() === 'resolved') {
        resolvedAt = Utils.toDate(transition.at);

        // hopefully we've pulled this incident before it got resolved, and have severity.
        // Once incident is resolved, the service status field resets to 'OK'
        severity = undefined;
      }

      if (updatedAt < transitionTime) {
        updatedAt = transitionTime;
      }
    }

    if (incident.pagedTeams?.length) {
      for (const pagedTeam of incident.pagedTeams) {
        const team = {
          uid: pagedTeam,
          source,
        };
        res.push({
          model: 'ims_TeamIncidentAssociation',
          record: {
            incident: incidentRef,
            team,
          },
        });
      }
    }

    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentRef,
        title: incident.entityId,
        description: incident.entityDisplayName,
        url: incident.incidentLink,
        createdAt,
        updatedAt,
        acknowledgedAt,
        resolvedAt,
        priority: undefined, // VO doesn't have priorities
        severity,
        status: this.getIncidentStatus(incident.currentPhase),
      },
    });

    const appField = this.applicationField(ctx);
    // check optional application field parameter
    const service =
      appField in incident && typeof incident[appField] === 'string'
        ? incident[appField]
        : incident.service;

    if (service) {
      const applicationMapping = this.applicationMapping(ctx);
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

    return res;
  }

  private getSeverity(state: string): {
    category: IncidentSeverityCategory;
    detail: string;
  } {
    const detail = state;
    switch (state.toLowerCase()) {
      case 'critical':
        return {category: IncidentSeverityCategory.Sev1, detail};
      case 'warn':
        return {category: IncidentSeverityCategory.Sev3, detail};
      case 'info':
      case 'ok':
        return {category: IncidentSeverityCategory.Sev5, detail};
      default:
        return {category: IncidentSeverityCategory.Custom, detail};
    }
  }

  private eventType(transitionType: IncidentPhase): IncidentEventType {
    let eventTypeCategory: IncidentEventTypeCategory;
    switch (transitionType) {
      case 'UNACKED':
      case 'triggered':
        eventTypeCategory = IncidentEventTypeCategory.Created;
        break;
      case 'ACKED':
      case 'acknowledged':
        eventTypeCategory = IncidentEventTypeCategory.Acknowledged;
        break;
      case 'RESOLVED':
      case 'resolved':
        eventTypeCategory = IncidentEventTypeCategory.Resolved;
        break;
      default:
        eventTypeCategory = IncidentEventTypeCategory.Custom;
        break;
    }
    return {category: eventTypeCategory, detail: transitionType};
  }

  private getIncidentStatus(incidentState: IncidentPhase): {
    category: string;
    detail: string;
  } {
    const detail = incidentState;
    switch (incidentState) {
      case 'ACKED':
      case 'acknowledged':
        return {category: IncidentStatusCategory.Identified, detail};
      case 'RESOLVED':
      case 'resolved':
        return {category: IncidentStatusCategory.Resolved, detail};
      case 'UNACKED':
      case 'triggered':
      default:
        return {category: IncidentStatusCategory.Investigating, detail};
    }
  }
}
