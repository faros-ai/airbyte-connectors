import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {
  IncidentSeverityCategory,
  PagerDutyConverter,
  PagerdutyObject,
} from './common';

const SeverityLevel = ['Sev1', 'Sev2', 'Sev3', 'Sev4', 'Sev5'];

interface Priority extends PagerdutyObject {
  readonly account_id: string;
  readonly color: string;
  readonly created_at: string;
  readonly description: string;
  readonly name: string;
  readonly order: string;
  readonly schema_version: number;
  readonly updated_at: string; // date-time
}

export class PrioritiesResource extends PagerDutyConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Incident',
  ];

  private readonly incidentsStream = new StreamName('pagerduty', 'incidents');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.incidentsStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const priorityResource = record.record.data as Priority;

    const incidentsStream = this.incidentsStream.asString;
    const incident = ctx.get(incidentsStream, String(priorityResource.id));
    const incidentPriority = incident?.record?.data?.priority;

    const defaultSeverity = this.pagerdutyConfig(ctx).default_severity;
    const severity = this.incidentSeverity(
      priorityResource,
      incidentPriority,
      defaultSeverity
    );

    if (!severity) return [];

    return [
      {
        model: 'ims_Incident__Update',
        record: {
          at: Date.now(),
          where: {
            uid: priorityResource.id,
            source,
          },
          mask: ['severity'],
          patch: {
            severity,
          },
        },
      },
    ];
  }

  private incidentSeverity(
    priorityResource: Priority,
    incidentPriority?: Priority,
    defaultSeverity?: IncidentSeverityCategory
  ): undefined | {category: string; detail: string} {
    if (!incidentPriority && defaultSeverity) {
      //priorities can be disabled on the PD account
      return defaultSeverity
        ? {category: defaultSeverity, detail: 'default'}
        : undefined;
    }
    const detail = incidentPriority?.summary ?? priorityResource.summary;
    const [severityIndex] = detail.match(/\d$/);
    if (incidentPriority) {
      return {category: SeverityLevel[severityIndex], detail};
    }
    return {category: 'Custom', detail};
  }
}
