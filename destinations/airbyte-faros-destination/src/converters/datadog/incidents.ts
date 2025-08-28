import {v2} from '@datadog/datadog-api-client';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

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
    'ims_IncidentApplicationImpact',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const config = this.config(ctx);
    const source = this.streamName.source;
    const incident = record.record.data as v2.IncidentResponseData;
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
    const summary = incident.attributes?.fields
      ?.summary as v2.IncidentFieldAttributesSingleValue;
    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentKey,
        title: incident.attributes?.title,
        description: summary?.value,
        url: null,
        severity:
          this.getSeverity(incident.attributes?.severity) ?? defaultSeverity,
        priority: null,
        status: this.getStatus(incident.attributes?.state) ?? null,
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

    const servicesField = incident.attributes?.fields
      ?.services as v2.IncidentFieldAttributesMultipleValue;
    const services: string[] = servicesField?.value;

    for (const application of this.getApplications(ctx, services)) {
      res.push({
        model: 'ims_IncidentApplicationImpact',
        record: {incident: incidentKey, application},
      });
    }

    return res;
  }

  private getSeverity(
    severity?: v2.IncidentSeverity
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
          return {
            category: IncidentSeverityCategory.Custom,
            detail: severity === 'UNKNOWN' ? severity : String(severity),
          };
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
