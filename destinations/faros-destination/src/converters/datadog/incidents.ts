import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {DatadogConverter, IncidentSeverityCategory} from './common';

enum IncidentStatusCategory {
  Created = 'Created',
  Identified = 'Identified',
  Investigating = 'Investigating',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export class DatadogIncidents extends DatadogConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Incident',
    'ims_IncidentAssignment',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const incident = record.record.data;
    const incidentKey = {
      uid: incident.id,
      source,
    };

    const defaultSeverityCategory = this.config(ctx).default_severity;
    const defaultSeverity = defaultSeverityCategory
      ? {
          category: defaultSeverityCategory,
          detail: 'default',
        }
      : null;

    return [
      {
        model: 'ims_Incident',
        record: {
          ...incidentKey,
          title: incident.attributes?.title,
          description: incident.attributes?.fields?.summary?.value,
          url: null,
          severity:
            this.getSeverity(incident.attributes?.severity) ?? defaultSeverity,
          priority: null,
          status: this.getStatus(incident.attributes?.state) ?? null,
          createdAt:
            Utils.toDate(incident.attributes?.created)?.getTime() ?? null,
          updatedAt:
            Utils.toDate(incident.attributes?.modified)?.getTime() ?? null,
          acknowledgedAt:
            Utils.toDate(incident.attributes?.detected)?.getTime() ?? null,
          resolvedAt:
            Utils.toDate(incident.attributes?.resolved)?.getTime() ?? null,
        },
      },
      {
        model: 'ims_IncidentAssignment',
        record: {
          incident: incidentKey,
          assignee: {
            uid: incident.relationships?.commanderUser,
            source,
          },
        },
      },
    ];
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
