import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  IncidentPriorityCategory,
  IncidentSeverityCategory,
  ServiceNowConverter,
} from './common';

enum IncidentStatusCategory {
  Created = 'Created',
  Identified = 'Identified',
  Investigating = 'Investigating',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export class Incidents extends ServiceNowConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Incident',
    'ims_IncidentAssignment',
    'compute_Application',
    'ims_IncidentApplicationImpact',
  ];

  private seenApplications = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const config = this.config(ctx);
    const source = this.streamName.source;
    const incident = record.record.data;
    const incidentKey = {
      uid: incident.sys_id,
      source,
    };

    const defaultSeverityCategory = config.default_severity;
    const defaultSeverity = defaultSeverityCategory
      ? {
          category: defaultSeverityCategory,
          detail: 'default',
        }
      : null;

    const defaultPriorityCategory = config.default_priority;
    const defaultPriority = defaultPriorityCategory
      ? {
          category: defaultPriorityCategory,
          detail: 'default',
        }
      : null;

    const res = [];
    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentKey,
        title: incident.number,
        description: incident.short_description,
        url: null,
        severity: this.getSeverity(incident.severity) ?? defaultSeverity,
        priority: this.getPriority(incident.priority) ?? defaultPriority,
        status: this.getStatus(incident.state) ?? null,
        createdAt: Utils.toDate(incident.opened_at) ?? null,
        updatedAt: Utils.toDate(incident.sys_updated_on) ?? null,
        resolvedAt: Utils.toDate(incident.resolved_at) ?? null,
      },
    });

    const assigneeUid = incident.assigned_to;
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

    const applicationField = this.applicationField(ctx);
    const applicationName =
      applicationField in incident &&
      typeof incident[applicationField] === 'string'
        ? incident[applicationField]
        : undefined;

    if (applicationName) {
      const applicationMapping = this.applicationMapping(ctx);
      const mappedApp = applicationMapping[applicationName];
      const application = Common.computeApplication(
        mappedApp?.name ?? applicationName,
        mappedApp?.platform
      );
      const appKey = application.uid;
      if (!this.seenApplications.has(appKey)) {
        res.push({model: 'compute_Application', record: application});
        this.seenApplications.add(appKey);
      }
      res.push({
        model: 'ims_IncidentApplicationImpact',
        record: {incident: incidentKey, application},
      });
    }

    return res;
  }

  private getSeverity(
    severity?: string
  ): {category: IncidentSeverityCategory; detail: string} | undefined {
    if (severity) {
      switch (severity) {
        case '1':
          return {category: IncidentSeverityCategory.Sev1, detail: severity};
        case '2':
          return {category: IncidentSeverityCategory.Sev2, detail: severity};
        case '3':
          return {category: IncidentSeverityCategory.Sev3, detail: severity};
        case '4':
          return {category: IncidentSeverityCategory.Sev4, detail: severity};
        case '5':
          return {category: IncidentSeverityCategory.Sev5, detail: severity};
        default:
          return {category: IncidentSeverityCategory.Custom, detail: severity};
      }
    }
  }

  private getPriority(
    priority?: string
  ): {category: IncidentPriorityCategory; detail: string} | undefined {
    if (priority) {
      switch (priority) {
        case '1':
          return {category: IncidentPriorityCategory.P1, detail: priority};
        case '2':
          return {category: IncidentPriorityCategory.P2, detail: priority};
        case '3':
          return {category: IncidentPriorityCategory.P3, detail: priority};
        case '4':
          return {category: IncidentPriorityCategory.P4, detail: priority};
        default:
          return {category: IncidentPriorityCategory.Custom, detail: priority};
      }
    }
  }

  private getStatus(
    state?: string
  ): {category: IncidentStatusCategory; detail: string} | undefined {
    if (state) {
      switch (state) {
        case '1': // New
          return {category: IncidentStatusCategory.Created, detail: 'New 1'};
        case '2': // In Progress
          return {
            category: IncidentStatusCategory.Investigating,
            detail: 'In Progess 2',
          };
        case '3': // On Hold
          return {category: IncidentStatusCategory.Custom, detail: 'On Hold 3'};
        case '6': // Resolved
          return {
            category: IncidentStatusCategory.Resolved,
            detail: 'Resolved 6',
          };
        case '7': // Closed
          return {category: IncidentStatusCategory.Custom, detail: 'Closed 7'};
        case '8': // Canceled
          return {
            category: IncidentStatusCategory.Custom,
            detail: 'Canceled 8',
          };
        default:
          return {category: IncidentStatusCategory.Custom, detail: state};
      }
    }
  }
}
