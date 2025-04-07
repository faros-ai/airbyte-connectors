import {
  Build as AzureBuild,
  BuildQueryOrder,
  BuildReason,
  BuildResult,
  BuildStatus,
  TaskResult,
  TimelineRecordState,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {
  RunResult,
  RunState,
} from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import {
  ProjectReference,
  Release,
  ReleaseQueryOrder,
} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {
  CodeCoverageStatistics,
  CoverageDetailedSummaryStatus,
} from 'azure-devops-node-api/interfaces/TestInterfaces';
import {wrapApiError} from 'faros-airbyte-cdk';
import {
  AzureDevOps,
  Build,
  Pipeline,
  Run,
  TimelineRecord,
} from 'faros-airbyte-common/azure-devops';
import {Utils} from 'faros-js-client';
import {DateTime} from 'luxon';
import {VError} from 'verror';
import {Memoize} from 'typescript-memoize';

export class AzurePipelines extends AzureDevOps {
  async checkConnection(projects?: ReadonlyArray<string>): Promise<void> {
    try {
      const allProjects = await this.getProjects(projects);
      if (!allProjects.length) {
        throw new VError('Failed to fetch projects');
      }
      await this.getPipelines(allProjects[0]);
    } catch (err: any) {
      let errorMessage = 'Please verify your access token is correct. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  @Memoize((project: ProjectReference) => project.id)
  async getPipelines(project: ProjectReference): Promise<Pipeline[]> {
    const pipelines = [];
    const result = await this.client.pipelines.listPipelines(project.id);
    for (const pipeline of result) {
      pipelines.push({
        project,
        ...pipeline,
      });
    }
    return pipelines;
  }

  // https://docs.microsoft.com/en-us/rest/api/azure/devops/build/builds
  async *getBuilds(
    project: ProjectReference,
    lastFinishTime?: number
  ): AsyncGenerator<Build> {
    const minTime = lastFinishTime
      ? Utils.toDate(lastFinishTime)
      : DateTime.now().minus({days: this.cutoffDays}).toJSDate();

    const getBuildsFn = (
      top: number,
      continuationToken: string | number
    ): Promise<AzureBuild[]> => {
      // API field 'finishTime' is a Date object, but actual token should be a string
      const token = continuationToken
        ? Utils.toDate(continuationToken)?.toISOString()
        : undefined;
      return this.client.build.getBuilds(
        project.id, // project id
        undefined, // definitions - array of definition ids
        undefined, // queues - array of queue ids
        undefined, // buildNumber - build number to search for
        minTime, // minTime - minimum build finish time
        undefined, // maxTime - maximum build finish time
        undefined, // requestedFor - team project ID
        undefined, // reasonFilter - build reason
        undefined, // statusFilter - build status
        undefined, // resultFilter - build result
        undefined, // tagFilters - build tags
        undefined, // properties - build properties
        top, // top - number of builds to return
        token, // continuationToken - token for pagination
        undefined, // maxBuildsPerDefinition - max builds per def
        undefined, // deletedFilter - include deleted builds
        BuildQueryOrder.FinishTimeAscending // queryOrder - sort order
      );
    };

    for await (const build of this.getPaginated(getBuildsFn, {
      useContinuationToken: true,
      continuationTokenParam: 'finishTime',
    }) ?? []) {
      const coverageStats = await this.getCoverageStats(project.id, build);

      // https://learn.microsoft.com/en-us/rest/api/azure/devops/build/artifacts/list
      const artifacts =
        (await this.client.build.getArtifacts(project.id, build.id)) ?? [];

      const jobs = await this.getJobs(project.id, build.id);
      yield {
        ...build,
        // Convert enum values to strings
        reason: BuildReason[build.reason]?.toLowerCase(),
        status: BuildStatus[build.status]?.toLowerCase(),
        result: BuildResult[build.result]?.toLowerCase(),
        artifacts,
        jobs,
        coverageStats,
      };
    }
  }

  private async getCoverageStats(
    projectId: string,
    build: AzureBuild
  ): Promise<CodeCoverageStatistics[]> {
    if (
      build.reason === BuildReason.PullRequest &&
      build.status === BuildStatus.Completed &&
      build.result === BuildResult.Succeeded
    ) {
      this.logger.debug(`Attempting to fetch coverage for build ${build.id}`);
      const coverage = await this.client.test.getCodeCoverageSummary(
        projectId,
        build.id
      );

      if (coverage) {
        this.logger.debug(`Coverage found for build ${build.id}`);
      }

      return coverage?.coverageDetailedSummaryStatus ===
        CoverageDetailedSummaryStatus.CodeCoverageSuccess
        ? coverage?.coverageData?.flatMap((c) => c.coverageStats)
        : undefined;
    }
  }

  // https://learn.microsoft.com/en-us/rest/api/azure/devops/build/timeline/get
  private async getJobs(
    projectId: string,
    buildId: number
  ): Promise<TimelineRecord[]> {
    const timeline = await this.client.build.getBuildTimeline(
      projectId,
      buildId
    );
    if (!timeline?.records) {
      this.logger.warn(`No timeline records found for build ${buildId}`);
      return [];
    }
    return timeline.records
      .filter((r) => r.type === 'Job')
      .map((r) => ({
        ...r,
        state: TimelineRecordState[r.state]?.toLowerCase(),
        result: TaskResult[r.result]?.toLowerCase(),
      }));
  }

  async *getReleases(
    project: ProjectReference,
    lastCreatedOn?: number
  ): AsyncGenerator<Release> {
    const minCreatedTime = lastCreatedOn
      ? Utils.toDate(lastCreatedOn)
      : DateTime.now().minus({days: this.cutoffDays}).toJSDate();

    const getReleasesFn = (
      top: number,
      continuationToken: string | number
    ): Promise<Release[]> =>
      this.client.release.getReleases(
        project.id,
        undefined, // definitionId
        undefined, // definitionEnvironmentId
        undefined, // searchText
        undefined, // createdBy
        undefined, // statusFilter
        undefined, // environmentStatusFilter
        minCreatedTime, // minCreatedTime
        undefined, // maxCreatedTime
        ReleaseQueryOrder.Ascending,
        top,
        Number(continuationToken)
      );

    yield* this.getPaginated(getReleasesFn, {
      useContinuationToken: true,
      continuationTokenParam: 'id',
    });
  }

  // TODO: Validate pagination and size
  async *getPipelineRuns(
    project: ProjectReference,
    pipelineId: number
  ): AsyncGenerator<Run> {
    const runs = await this.client.pipelines.listRuns(project.id, pipelineId);
    for (const run of runs) {
      yield {
        ...run,
        state: RunState[run.state]?.toLowerCase(),
        result: RunResult[run.result]?.toLowerCase(),
        project,
      };
    }
  }
}
