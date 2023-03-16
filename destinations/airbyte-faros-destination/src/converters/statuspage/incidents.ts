import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  ComponentStatus,
  IncidentEventType,
  IncidentEventTypeCategory,
  IncidentPriority,
  IncidentPriorityCategory,
  IncidentSeverity,
  IncidentSeverityCategory,
  IncidentStatusCategory,
  StatuspageConverter,
  StatuspageIncidentImpact,
  StatuspageIncidentStatus,
} from './common';

export class Incidents extends StatuspageConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
    'ims_Incident',
    'ims_IncidentApplicationImpact',
  ];

  private seenApplications = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const incident = record.record.data;
    const res: DestinationRecord[] = [];

    const incidentRef = {uid: incident.id, source};
    const createdAt = Utils.toDate(incident.created_at);

    let acknowledgedAt = Utils.toDate(incident.created_at); // Statuspage doesn't have "triggered" semantic status
    const resolvedAt = incident.resolved_at
        ? Utils.toDate(incident.resolved_at)
        : undefined,
      updatedAt = Utils.toDate(incident.updated_at);

    for (const update of incident.incident_updates) {
      const eventTime = Utils.toDate(update.created_at);

      if (update.status === StatuspageIncidentStatus.Investigating) {
        acknowledgedAt = eventTime;
      }
    }

    // Statuspage doesn't have incident severity, take "severity" from status
    // Use highest severity in incident's history as its severity
    let severity: IncidentSeverity | undefined = undefined;

    for (const update of incident.incident_updates ?? []) {
      for (const component of update.affected_components ?? []) {
        const thisSeverity = this.getSeverity(component.new_status);
        if (!severity) severity = thisSeverity;
        if (thisSeverity.category < severity.category) severity = thisSeverity;
      }
      res.push({
        model: 'ims_IncidentEvent',
        record: {
          uid: update.id,
          type: this.eventType(update.status),
          createdAt: Utils.toDate(update.created_at),
          detail: update.body,
          incident: {uid: update.incident_id, source},
        },
      });
    }

    // If severity could not be found from historical components, try root components
    if (!severity) {
      for (const component of incident.components) {
        const thisSeverity = this.getSeverity(component.status);
        if (!severity) severity = thisSeverity;
        if (thisSeverity.category < severity.category) severity = thisSeverity;
      }
    }

    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentRef,
        title: incident.name,
        description: incident.postmortem_body,
        url: incident.shortlink,
        createdAt,
        updatedAt,
        acknowledgedAt,
        resolvedAt,
        priority: this.getPriority(incident.impact),
        severity,
        status: this.getIncidentStatus(incident.status),
      },
    });

    if (incident.components) {
      const applicationMapping = this.applicationMapping(ctx);
      for (const service of incident.components) {
        if (!service.name) continue;

        const mappedApp = applicationMapping[service.name];
        const application = Common.computeApplication(
          mappedApp?.name ?? service.name,
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

    return res;
  }

  private getPriority(impact: StatuspageIncidentImpact): IncidentPriority {
    const detail: string = impact;
    switch (impact) {
      case StatuspageIncidentImpact.Critical:
        return {category: IncidentPriorityCategory.Critical, detail};
      case StatuspageIncidentImpact.Major:
        return {category: IncidentPriorityCategory.High, detail};
      case StatuspageIncidentImpact.Minor:
        return {category: IncidentPriorityCategory.Medium, detail};
      case StatuspageIncidentImpact.None:
        return {category: IncidentPriorityCategory.Low, detail};
      default:
        return {category: IncidentPriorityCategory.Custom, detail};
    }
  }

  private getSeverity(componentStatus: string): IncidentSeverity {
    const detail: string = componentStatus;
    switch (componentStatus) {
      case ComponentStatus.major_outage:
        return {category: IncidentSeverityCategory.Sev1, detail};
      case ComponentStatus.partial_outage:
        return {category: IncidentSeverityCategory.Sev2, detail};
      case ComponentStatus.degraded_performance:
        return {category: IncidentSeverityCategory.Sev3, detail};
      case ComponentStatus.under_maintenance:
        return {category: IncidentSeverityCategory.Sev4, detail};
      case ComponentStatus.operational:
        return {category: IncidentSeverityCategory.Sev5, detail};
      default:
        return {category: IncidentSeverityCategory.Custom, detail};
    }
  }

  private getIncidentStatus(incidentState: StatuspageIncidentStatus): {
    category: string;
    detail: string;
  } {
    const detail = incidentState;
    switch (incidentState) {
      case StatuspageIncidentStatus.Investigating:
        return {category: IncidentStatusCategory.Investigating, detail};
      case StatuspageIncidentStatus.Identified:
        return {category: IncidentStatusCategory.Identified, detail};
      case StatuspageIncidentStatus.Monitoring:
      case StatuspageIncidentStatus.Postmortem:
        return {category: IncidentStatusCategory.Monitoring, detail};
      case StatuspageIncidentStatus.Resolved:
        return {category: IncidentStatusCategory.Resolved, detail};
      default:
        return {category: IncidentStatusCategory.Custom, detail};
    }
  }

  private eventType(updateStatus: StatuspageIncidentStatus): IncidentEventType {
    const detail: string = updateStatus;
    switch (updateStatus) {
      case StatuspageIncidentStatus.Investigating:
        return {category: IncidentEventTypeCategory.Created, detail};
      case StatuspageIncidentStatus.Identified:
        return {category: IncidentEventTypeCategory.Acknowledged, detail};
      case StatuspageIncidentStatus.Resolved:
        return {category: IncidentEventTypeCategory.Resolved, detail};
      case StatuspageIncidentStatus.Monitoring:
      case StatuspageIncidentStatus.Postmortem:
      default:
        return {category: IncidentEventTypeCategory.Custom, detail};
    }
  }
}
