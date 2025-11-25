import {
  TfvcBranch,
  TfvcChange,
  TfvcChangesetRef,
  TfvcChangesetSearchCriteria,
} from 'azure-devops-node-api/interfaces/TfvcInterfaces';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {
  AzureDevOps,
  AzureDevOpsClient,
  Changeset,
} from 'faros-airbyte-common/azure-devops';
import {DateTime} from 'luxon';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_CUTOFF_DAYS = 90;

export class AzureTfvc extends AzureDevOps {
  private readonly includeChanges: boolean;

  constructor(
    protected readonly client: AzureDevOpsClient,
    protected readonly instanceType: 'cloud' | 'server',
    protected readonly cutoffDays: number = DEFAULT_CUTOFF_DAYS,
    protected readonly top: number = DEFAULT_PAGE_SIZE,
    protected readonly logger: AirbyteLogger,
    includeChanges: boolean = true
  ) {
    super(client, instanceType, cutoffDays, top, logger);
    this.includeChanges = includeChanges;
  }

  async checkConnection(projects?: ReadonlyArray<string>): Promise<void> {
    try {
      const allProjects = await this.getProjects(projects);
      if (!allProjects.length) {
        throw new VError('Failed to fetch projects');
      }
      // Try to fetch changesets to verify TFVC access
      await this.client.tfvc.getChangesets(
        allProjects[0].id,
        undefined, // maxCommentLength
        0, // skip
        1 // top - only need 1 to verify access
      );
    } catch (err: any) {
      throw new VError(err, 'Please verify your access token and TFVC permissions');
    }
  }

  async *getChangesets(
    project: string,
    since?: string
  ): AsyncGenerator<Changeset> {
    const searchCriteria: TfvcChangesetSearchCriteria = {};

    if (since) {
      searchCriteria.fromDate = since;
    } else {
      const cutoffDate = DateTime.now().minus({days: this.cutoffDays});
      searchCriteria.fromDate = cutoffDate.toISO();
    }

    const getChangesetsFn = (
      top: number,
      skip: number | string
    ): Promise<TfvcChangesetRef[]> =>
      this.client.tfvc.getChangesets(
        project,
        undefined, // maxCommentLength
        skip as number,
        top,
        'id desc',
        searchCriteria
      );

    for await (const changesetRef of this.getPaginated(getChangesetsFn)) {
      let changes: TfvcChange[] = [];

      if (this.includeChanges) {
        changes = await this.getChangesetChanges(changesetRef.changesetId);
      }

      yield {
        ...changesetRef,
        changes,
        project: {id: project, name: project},
      };
    }
  }

  private async getChangesetChanges(changesetId: number): Promise<TfvcChange[]> {
    const getChangesFn = (
      top: number,
      skip: number | string
    ): Promise<TfvcChange[]> =>
      this.client.tfvc.getChangesetChanges(changesetId, skip as number, top);

    const changes: TfvcChange[] = [];
    for await (const change of this.getPaginated(getChangesFn)) {
      changes.push(change);
    }
    return changes;
  }

  @Memoize((project: string) => project)
  async getBranches(project?: string): Promise<TfvcBranch[]> {
    try {
      const branches = await this.client.tfvc.getBranches(
        project,
        true, // includeParent
        true, // includeChildren
        false, // includeDeleted
        false // includeLinks
      );
      return branches || [];
    } catch (err: any) {
      this.logger.error(
        `Failed to fetch TFVC branches: ${wrapApiError(err).message}`
      );
      return [];
    }
  }
}
