import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {FireHydrant, FireHydrantConfig} from '../firehydrant/firehydrant';
import {Incident} from '../firehydrant/models';
interface IncidentState {
  lastUpdatedAt?: Date;
}
export class Incidents extends AirbyteStreamBase {
  constructor(
    private readonly config: FireHydrantConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/incidents.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return 'updated_at';
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: IncidentState
  ): AsyncGenerator<Incident> {
    const lastUpdatedAt =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastUpdatedAt
        : undefined;
    
    const firehydrant = FireHydrant.instance(this.config, this.logger);
    yield* firehydrant.getIncidents(lastUpdatedAt);
  }

  /**
   * Computes the updated timestamp for an incident based on the latest lifecycle phase milestone.
   * This method examines all milestones across all lifecycle phases and returns the most recent
   * milestone occurrence time. Falls back to the incident's created_at if no milestones exist.
   * 
   * @param incident - The incident to compute the updated timestamp for
   * @returns The computed updated timestamp as a Date object
   */
  private getIncidentUpdatedAt(incident: Incident): Date {
    const allMilestones = incident.lifecycle_phases?.flatMap(phase => phase.milestones) || [];
    const latestMilestone = allMilestones.reduce((latest, current) => 
      new Date(current.occurred_at || 0) > new Date(latest?.occurred_at || 0) ? current : latest
    , null);
    return new Date(latestMilestone?.occurred_at || incident.created_at);
  }

  getUpdatedState(
    currentStreamState: IncidentState,
    latestRecord: Incident
  ): IncidentState {
    const lastUpdatedAt = this.getIncidentUpdatedAt(latestRecord);
    
    return {
      lastUpdatedAt:
        lastUpdatedAt >
        new Date(currentStreamState?.lastUpdatedAt ?? 0)
          ? lastUpdatedAt
          : currentStreamState?.lastUpdatedAt,
    };
  }
}
