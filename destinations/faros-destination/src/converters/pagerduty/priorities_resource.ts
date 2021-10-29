import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {PagerdutyConverter, PagerdutyObject} from './common';

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

export class PagerdutyPrioritiesResource extends PagerdutyConverter {
  private readonly logger = new AirbyteLogger();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Incident',
  ];

  private readonly incidentsStream = new StreamName('pagerduty', 'incidents');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.incidentsStream];
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const priorityResource = record.record.data as Priority;

    const incidentsStream = this.incidentsStream.asString;
    const incident = ctx.get(incidentsStream, String(priorityResource.id));
    const incidentPriority = incident?.record?.data?.priority;

    const severity = this.incidentSeverity(priorityResource, incidentPriority);

    if (!severity) return [];

    return [
      {
        model: 'ims_Incident__Update',
        record: {
          at: record.record.emitted_at,
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
    incidentPriority?: Priority
  ): undefined | {category: string; detail: string} {
    if (!incidentPriority) {
      return undefined;
    }
    const detail = incidentPriority.summary;
    const [severityIndex] = detail.match(/\d$/);
    if (priorityResource.id === incidentPriority.id) {
      return {category: SeverityLevel[severityIndex], detail};
    }
    return {category: 'Custom', detail};
  }
}
