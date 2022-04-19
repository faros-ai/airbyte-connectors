import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

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
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const config = this.config(ctx);
    const source = this.streamName.source;
    const incident = record.record.data;
    const incidentKey = {
      uid: incident.sys_id.value,
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
        title: incident.number?.value,
        description: incident.short_description?.value,
        url: null,
        severity: this.getSeverity(incident.severity?.value) ?? defaultSeverity,
        priority: this.getPriority(incident.priority?.value) ?? defaultPriority,
        status: this.getStatus(incident.state?.displayValue) ?? null,
        createdAt: Utils.toDate(incident.opened_at?.value) ?? null,
        updatedAt: Utils.toDate(incident.sys_updated_on?.value) ?? null,
        resolvedAt: Utils.toDate(incident.resolved_at?.resolved) ?? null,
      },
    });

    const assigneeUid = incident.assigned_to?.value;
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

    // const applicationMapping = this.applicationMapping(ctx);
    // const services: string[] = incident.attributes?.fields?.services?.value;
    // if (services) {
    //   for (const service of services) {
    //     let application = {name: service, platform: ''};
    //     if (applicationMapping?.[service]?.name) {
    //       const mappedApp = applicationMapping[service];
    //       application = {
    //         name: mappedApp.name,
    //         platform: mappedApp.platform ?? '',
    //       };
    //     }
    //     res.push({model: 'compute_Application', record: application});
    //     res.push({
    //       model: 'ims_IncidentApplicationImpact',
    //       record: {
    //         incident: incidentKey,
    //         application,
    //       },
    //     });
    //   }
    // }

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
        case 'New':
          return {category: IncidentStatusCategory.Created, detail: state};
        case 'In Progress':
          return {
            category: IncidentStatusCategory.Investigating,
            detail: state,
          };
        case 'On Hold':
          return {category: IncidentStatusCategory.Identified, detail: state};
        case 'Resolved':
          return {category: IncidentStatusCategory.Resolved, detail: state};
        default:
          return {category: IncidentStatusCategory.Custom, detail: state};
      }
    }
  }
}
