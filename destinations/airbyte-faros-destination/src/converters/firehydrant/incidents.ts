import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {FireHydrantConverter} from './common';
import {IncidentStatus} from './models';
import {
  FirehydrantIncidentMilestone,
  FirehydrantIncidentPriority,
  FirehydrantIncidentSeverity,
  Incident,
  IncidentPriority,
  IncidentPriorityCategory,
  IncidentSeverity,
  IncidentSeverityCategory,
  IncidentStatusCategory,
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
    const createdAt = Utils.toDate(incident.created_at);
    const startedAt = Utils.toDate(incident.started_at);

    // Extract timestamps from lifecycle_phases
    const allMilestones =
      incident.lifecycle_phases?.flatMap((phase) => phase.milestones) || [];

    // Get the latest milestone timestamp for updatedAt
    const latestMilestone = allMilestones.length
      ? allMilestones.reduce((latest, current) =>
          new Date(current.occurred_at || 0) > new Date(latest.occurred_at || 0)
            ? current
            : latest
        )
      : null;
    const updatedAt = latestMilestone
      ? Utils.toDate(latestMilestone.occurred_at)
      : createdAt;
    const acknowledgedMilestone = allMilestones.find(
      (milestone) => milestone.slug === 'acknowledged'
    );
    const resolvedMilestone = allMilestones.find(
      (milestone) => milestone.slug === 'resolved'
    );

    const acknowledgedAt = Utils.toDate(acknowledgedMilestone?.occurred_at);
    const resolvedAt = Utils.toDate(resolvedMilestone?.occurred_at);

    for (const milestone of allMilestones) {
      if (!milestone.id || !milestone.occurred_at) continue;

      const eventType = this.getIncidentStatus(milestone.slug);
      res.push({
        model: 'ims_IncidentEvent',
        record: {
          uid: milestone.id,
          type: eventType,
          incident: incidentRef,
          detail: milestone.name,
          createdAt: Utils.toDate(milestone.occurred_at),
        },
      });
    }

    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentRef,
        title: incident.name,
        description: Utils.cleanAndTruncate(
          incident.description,
          maxDescriptionLength
        ),
        url: incident.incident_url,
        createdAt,
        startedAt,
        updatedAt,
        acknowledgedAt,
        resolvedAt,
        priority: this.getPriority(incident.priority),
        severity: this.getSeverity(incident.severity),
        status: this.getIncidentStatus(incident.current_milestone),
      },
    });

    if (incident.services) {
      const applicationMapping = this.applicationMapping(ctx);
      for (const service of incident.services) {
        if (!service?.name) continue;
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

  // https://docs.firehydrant.com/docs/incident-milestones-lifecycle-phases
  private getIncidentStatus(milestone: string): IncidentStatus {
    const detail = milestone;
    switch (milestone) {
      case FirehydrantIncidentMilestone.started:
      case FirehydrantIncidentMilestone.detected:
      case FirehydrantIncidentMilestone.acknowledged:
        return {category: IncidentStatusCategory.Created, detail};
      case FirehydrantIncidentMilestone.investigating:
        return {category: IncidentStatusCategory.Investigating, detail};
      case FirehydrantIncidentMilestone.identified:
        return {category: IncidentStatusCategory.Identified, detail};
      case FirehydrantIncidentMilestone.mitigated:
        return {category: IncidentStatusCategory.Monitoring, detail};
      case FirehydrantIncidentMilestone.resolved:
      case FirehydrantIncidentMilestone.retrospective_started:
      case FirehydrantIncidentMilestone.retrospective_completed:
      case FirehydrantIncidentMilestone.closed:
        return {category: IncidentStatusCategory.Resolved, detail};
      default:
        return {category: IncidentStatusCategory.Custom, detail};
    }
  }
}
