import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {DatadogConverter, IncidentSeverityCategory} from './common';

enum IncidentStatusCategory {
  Created = 'Created',
  Identified = 'Identified',
  Investigating = 'Investigating',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export class Incidents extends DatadogConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Incident',
    'ims_IncidentAssignment',
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
      uid: incident.id,
      source,
    };

    const defaultSeverityCategory = config.default_severity;
    const defaultSeverity = defaultSeverityCategory
      ? {
          category: defaultSeverityCategory,
          detail: 'default',
        }
      : null;

    const res = [];
    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentKey,
        title: incident.attributes?.title,
        description: incident.attributes?.fields?.summary?.value,
        url: null,
        severity:
          this.getSeverity(incident.attributes?.fields?.severity?.value) ??
          defaultSeverity,
        priority: null,
        status:
          this.getStatus(incident.attributes?.fields?.state?.value) ?? null,
        createdAt: Utils.toDate(incident.attributes?.created) ?? null,
        updatedAt: Utils.toDate(incident.attributes?.modified) ?? null,
        resolvedAt: Utils.toDate(incident.attributes?.resolved) ?? null,
      },
    });

    const assigneeUid = incident.relationships?.commanderUser?.data?.id;
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

    const services: string[] = incident.attributes?.fields?.services?.value;
    if (services) {
      const applicationMapping = this.applicationMapping(ctx);
      for (const service of services) {
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
          record: {incident: incidentKey, application},
        });
      }
    }

    return res;
  }

  private getSeverity(
    severity?: string
  ): {category: IncidentSeverityCategory; detail: string} | undefined {
    if (severity) {
      switch (severity) {
        case 'SEV-1':
          return {category: IncidentSeverityCategory.Sev1, detail: severity};
        case 'SEV-2':
          return {category: IncidentSeverityCategory.Sev2, detail: severity};
        case 'SEV-3':
          return {category: IncidentSeverityCategory.Sev3, detail: severity};
        case 'SEV-4':
          return {category: IncidentSeverityCategory.Sev4, detail: severity};
        case 'SEV-5':
          return {category: IncidentSeverityCategory.Sev5, detail: severity};
        default:
          return {category: IncidentSeverityCategory.Custom, detail: severity};
      }
    }
  }

  private getStatus(
    state?: string
  ): {category: IncidentStatusCategory; detail: string} | undefined {
    if (state) {
      switch (state) {
        case 'declared':
          return {category: IncidentStatusCategory.Created, detail: state};
        case 'active':
          return {
            category: IncidentStatusCategory.Investigating,
            detail: state,
          };
        case 'stable':
          return {category: IncidentStatusCategory.Identified, detail: state};
        case 'resolved':
          return {category: IncidentStatusCategory.Resolved, detail: state};
        default:
          return {category: IncidentStatusCategory.Custom, detail: state};
      }
    }
  }
}
