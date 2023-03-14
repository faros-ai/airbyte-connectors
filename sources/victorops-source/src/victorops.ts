import axiosRetry, {
  IAxiosRetryConfig,
  isNetworkOrIdempotentRequestError,
} from 'axios-retry';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {VError} from 'verror';
import VictorOpsApiClient from 'victorops-api-client';

export const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_CURRENT_PHASE = 'triggered,acknowledged,resolved';

export interface VictoropsConfig {
  readonly apiId: string;
  readonly apiKey: string;
  readonly cutoff_days: number;
}

export interface VictoropsState {
  cutoff: string;
}

interface VictoropsObject {
  readonly name: string;
  readonly slug: string;
}

export interface Team extends VictoropsObject {
  readonly _selfUrl: string;
  readonly _membersUrl: string;
  readonly _policiesUrl: string;
  readonly _adminsUrl: string;
  readonly memberCount: number;
  readonly version: number;
  readonly isDefaultTeam: boolean;
}

export interface User {
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly username: string;
  readonly email: string;
  readonly createdAt: string; // date-time
  readonly passwordLastUpdated: string; // date-time
  readonly verified: boolean;
  readonly _selfUrl: string; // e.g. '/api-public/v1/user/yevgenius'
}

interface PagedPolicy {
  readonly policy: VictoropsObject;
  readonly team: VictoropsObject;
}
interface IncidentTransition {
  readonly name: IncidentPhase;
  readonly at: string;
  readonly by: string; // username
  readonly message?: string;
}

type IncidentPhase =
  | 'RESOLVED'
  | 'UNACKED'
  | 'ACKED'
  | 'triggered'
  | 'acknowledged'
  | 'resolved';

export interface Incident {
  readonly alertCount?: number;
  readonly currentPhase: IncidentPhase;
  readonly entityDisplayName?: string;
  readonly entityId?: string;
  readonly entityState?: string;
  readonly entityType?: string;
  readonly host?: string;
  readonly incidentNumber: string;
  readonly lastAlertId?: string;
  readonly lastAlertTime?: string; // date-time
  readonly service?: string;
  readonly startTime: string; //date-time
  readonly pagedTeams?: string[];
  readonly pagedUsers?: User[];
  readonly pagedPolicies?: PagedPolicy[];
  readonly transitions: IncidentTransition[];
  readonly monitorName?: string;
  readonly monitorType?: string;
  readonly incidentLink?: string;
}

interface IncidentReportingResult {
  offset: number;
  limit: number;
  total: number;
  incidents: Incident[];
}

export class Victorops {
  private static victorops: Victorops;

  constructor(
    private readonly client: VictorOpsApiClient,
    readonly startDate: Date
  ) {}

  static instance(config: VictoropsConfig, logger: AirbyteLogger): Victorops {
    if (Victorops.victorops) return Victorops.victorops;

    if (!config.apiId) {
      throw new VError('API ID must be not an empty string');
    }
    if (!config.apiKey) {
      throw new VError('API key must be not an empty string');
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }

    const client = new VictorOpsApiClient({
      apiId: config.apiId,
      apiKey: config.apiKey,
      maxBodyLength: 50000,
      maxContentLength: Infinity,
      timeout: 65000, // wait for axios-retry on rate limiting (upto 62 seconds)
    });

    // Victoropes Documentation states API is rate limited to once per minute
    // in practice it allows calls with seconds apart
    const retryConfig: IAxiosRetryConfig = {
      retryDelay: axiosRetry.exponentialDelay,
      shouldResetTimeout: true,
      retries: 5, // retry upto a minute
      retryCondition: (error) => {
        return (
          error.response?.status == 429 ||
          String(error).includes('429') ||
          isNetworkOrIdempotentRequestError(error)
        );
      },
    };

    axiosRetry(client._axiosInstance, retryConfig);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);

    Victorops.victorops = new Victorops(client, startDate);
    return Victorops.victorops;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.users.getUsers();
    } catch (error: any) {
      const err = error?.message ?? error?.statusText ?? '';
      throw new VError(
        `Please verify your API ID or key are correct. Error: ${err}`
      );
    }
  }

  async *getUsers(): AsyncGenerator<User> {
    const res = await this.client.users.getUsers();

    for (const user of res.users.flat()) {
      yield user;
    }
  }

  async *getTeams(): AsyncGenerator<Team> {
    const res = await this.client.teams.getTeams();
    for (const team of res) {
      yield team;
    }
  }

  async *getIncidents(
    startedAfter = new Date(0),
    limit = DEFAULT_PAGE_LIMIT,
    currentPhase = DEFAULT_CURRENT_PHASE
  ): AsyncGenerator<Incident> {
    const startedAfterMax =
      startedAfter > this.startDate ? startedAfter : this.startDate;
    let offset = 0;
    let incidentCount = 0;
    let incidentTotal = 0;
    do {
      const query = {
        offset,
        limit,
        currentPhase,
        startedAfterMax,
      };
      const res = (await this.client.reporting.getIncidentHistory(
        query
      )) as IncidentReportingResult;
      incidentTotal = res.total;
      for (const incident of res.incidents) {
        yield incident;
      }
      incidentCount = res.incidents.length;
      if (!incidentCount) break; //to avoid infinte looping in case of weird API behavior
      offset += incidentCount;
    } while (offset < incidentTotal);
  }
}
