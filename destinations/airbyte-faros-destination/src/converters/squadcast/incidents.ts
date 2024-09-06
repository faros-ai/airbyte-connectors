import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  Incident,
  IncidentPriority,
  IncidentPriorityCategory,
  IncidentSeverity,
  IncidentSeverityCategory,
  IncidentStatusCategory,
  SquadcastCommon,
  SquadcastConverter,
} from './common';

export class Incidents extends SquadcastConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Incident',
    'ims_IncidentApplicationImpact',
    'ims_Label',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const incident = record.record.data as Incident;
    const res: DestinationRecord[] = [];

    const incidentRef = {uid: incident.id, source};
    const createdAt = Utils.toDate(incident.created_at);
    const acknowledgedAt = Utils.toDate(incident.acknowledged_at);
    const resolvedAt = Utils.toDate(incident.resolved_at);
    let updatedAt = resolvedAt > acknowledgedAt ? resolvedAt : acknowledgedAt;
    if (createdAt > updatedAt) {
      updatedAt = createdAt;
    }

    const status = incident.status && this.toIncidentStatus(incident.status);

    /** SquadCast doesn't have incident severity and priority, take "severity" and "priority" from tags */
    let priority: IncidentPriority;
    let severity: IncidentSeverity;
    Object.entries(incident.tags || {}).forEach(([name, tag]) => {
      if (tag.value) {
        if (name === 'severity') {
          severity = this.toSeverity(tag.value);
        }
        if (name === 'priority') {
          priority = this.toPriority(tag.value);
        }
      }

      const label = {name};

      res.push({
        model: 'ims_Label',
        record: label,
      });
      res.push({
        model: 'ims_IncidentTag',
        record: {
          incident: incidentRef,
          label,
        },
      });
    });

    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentRef,
        title: incident.title,
        description: Utils.cleanAndTruncate(
          incident.description,
          SquadcastCommon.MAX_DESCRIPTION_LENGTH
        ),
        createdAt,
        updatedAt,
        acknowledgedAt,
        resolvedAt,
        priority,
        severity,
        status,
      },
    });

    if (incident.service) {
      const applicationMapping = this.applicationMapping(ctx);
      const mappedApp = applicationMapping[incident.service];
      const application = Common.computeApplication(
        mappedApp?.name ?? incident.service,
        mappedApp?.platform
      );
      res.push({
        model: 'ims_IncidentApplicationImpact',
        record: {incident: incidentRef, application},
      });
    }

    return res;
  }

  private toPriority(priority: string): IncidentPriority {
    const detail: string = priority.toLowerCase();
    switch (detail) {
      case 'critical':
        return {category: IncidentPriorityCategory.Critical, detail};
      case 'high':
        return {category: IncidentPriorityCategory.High, detail};
      case 'medium':
        return {category: IncidentPriorityCategory.Medium, detail};
      case 'low':
        return {category: IncidentPriorityCategory.Low, detail};
      default:
        return {category: IncidentPriorityCategory.Custom, detail};
    }
  }

  private toSeverity(severity: string): IncidentSeverity {
    const detail: string = severity.toLowerCase();
    switch (detail) {
      case 'sev1':
        return {category: IncidentSeverityCategory.Sev1, detail};
      case 'sev2':
        return {category: IncidentSeverityCategory.Sev2, detail};
      case 'sev3':
        return {category: IncidentSeverityCategory.Sev3, detail};
      case 'sev4':
        return {category: IncidentSeverityCategory.Sev4, detail};
      case 'sev5':
        return {category: IncidentSeverityCategory.Sev5, detail};
      default:
        return {category: IncidentSeverityCategory.Custom, detail};
    }
  }

  private toIncidentStatus(incidentState: string): {
    category: string;
    detail: string;
  } {
    const detail = incidentState.toLowerCase();
    switch (incidentState) {
      case 'investigating':
      case 'triggered':
        return {category: IncidentStatusCategory.Investigating, detail};
      case 'identified':
      case 'acknowledged':
        return {category: IncidentStatusCategory.Identified, detail};
      case 'monitoring':
        return {category: IncidentStatusCategory.Monitoring, detail};
      case 'resolved':
        return {category: IncidentStatusCategory.Resolved, detail};
      default:
        return {category: IncidentStatusCategory.Custom, detail};
    }
  }
}
