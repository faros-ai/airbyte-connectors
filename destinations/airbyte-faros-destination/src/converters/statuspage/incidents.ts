import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {
  ApplicationImpact,
  ApplicationImpactCategory,
  ComponentsStream,
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
    'ims_Incident',
    'ims_IncidentApplicationImpact',
  ];

  override get dependencies(): ReadonlyArray<StreamName> {
    return [ComponentsStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const incident = record.record.data;
    const res: DestinationRecord[] = [];

    const incidentRef = {uid: incident.id, source};
    const createdAt = Utils.toDate(incident.created_at);
    const startedAt = incident.started_at
      ? Utils.toDate(incident.started_at)
      : undefined;

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

    const componentImpacts: Map<
      string,
      {impact: ApplicationImpact; endedAt: Date}
    > = new Map();

    for (const update of incident.incident_updates ?? []) {
      for (const component of update.affected_components ?? []) {
        const thisSeverity = this.getSeverity(component.new_status);
        const thisImpact = this.getApplicationImpact(component.new_status);
        const eventTime = Utils.toDate(update.created_at);
        if (!severity) {
          severity = thisSeverity;
        } else if (thisSeverity.category < severity.category) {
          severity = thisSeverity;
        }
        if (!componentImpacts.has(component.code)) {
          componentImpacts.set(component.code, {
            impact: thisImpact,
            endedAt: eventTime,
          });
        } else {
          const compImp = componentImpacts.get(component.code);
          // get most severe impact
          if (thisImpact.category > compImp.impact.category) {
            componentImpacts.set(component.code, {
              impact: thisImpact,
              endedAt: compImp.endedAt,
            });
          }
          // get last transition to operational
          if (component.new_status === ApplicationImpactCategory.Operational) {
            const existingEndedAt = compImp.endedAt;
            const newEndedAt =
              existingEndedAt < eventTime ? eventTime : existingEndedAt;

            componentImpacts.set(component.code, {
              impact: compImp.impact,
              endedAt: newEndedAt,
            });
          }
        }
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
        startedAt,
        updatedAt,
        acknowledgedAt,
        resolvedAt,
        priority: this.getPriority(incident.impact),
        severity,
        status: this.getIncidentStatus(incident.status),
      },
    });

    if (incident.components) {
      for (const component of incident.components) {
        if (!component.name) continue;

        const application = this.computeApplication(ctx, component);
        const compImp = componentImpacts.get(component.id);
        res.push({
          model: 'ims_IncidentApplicationImpact',
          record: {
            incident: incidentRef,
            application,
            impact:
              compImp?.impact ?? this.getApplicationImpact(component.status),
            startedAt: createdAt,
            endedAt: compImp?.endedAt ?? resolvedAt,
          },
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

  private getApplicationImpact(componentStatus: string): ApplicationImpact {
    const detail: string = componentStatus;
    switch (componentStatus) {
      case ComponentStatus.major_outage:
        return {category: ApplicationImpactCategory.MajorOutage, detail};
      case ComponentStatus.partial_outage:
        return {category: ApplicationImpactCategory.PartialOutage, detail};
      case ComponentStatus.degraded_performance:
        return {
          category: ApplicationImpactCategory.DegradedPerformance,
          detail,
        };
      case ComponentStatus.under_maintenance:
        return {category: ApplicationImpactCategory.UnderMaintenance, detail};
      case ComponentStatus.operational:
        return {category: ApplicationImpactCategory.Operational, detail};
      default:
        return {category: ApplicationImpactCategory.Custom, detail};
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
