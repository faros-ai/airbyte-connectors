import {
  Build as AzureBuild,
  BuildReason,
  BuildResult,
  BuildStatus,
  TaskResult,
  TimelineRecordState,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {
  Run as AzureRun,
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
  Pipeline,
  Run,
  TimelineRecord,
} from 'faros-airbyte-common/azure-devops';
import {Utils} from 'faros-js-client';
import {DateTime} from 'luxon';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {Build, PipelineReference} from './types';

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

  // https://learn.microsoft.com/en-us/rest/api/azure/devops/pipelines/runs/list
  async *getRuns(
    project: ProjectReference,
    pipeline: PipelineReference,
    lastFinishDate?: number
  ): AsyncGenerator<Run> {
    const cutoff = lastFinishDate
      ? Utils.toDate(lastFinishDate)
      : DateTime.now().minus({days: this.cutoffDays}).toJSDate();

    let response;
    let restResponse = false;
    try {
      response = (await this.client.pipelines.listRuns(
        project.id,
        pipeline.id
      )) as any;
      this.logger.debug(
        `Fetch result using client: Runs: ${JSON.stringify(response)}`
      );
    } catch (error) {
      this.logger.error(
        `Error fetching runs for pipeline ${pipeline.name}: ${error}`
      );
    }

    if (!response) {
      this.logger.warn(
        `Attempting to fetch runs using rest api: ${pipeline.name}`
      );
      try {
        const res = await this.client.rest.get<AzureRun[]>(
          `/${project.id}/_apis/pipelines/${pipeline.id}/runs`
        );
        response = res?.data;
        restResponse = true;
        this.logger.debug(
          `Fetch result using rest api: Runs: ${JSON.stringify(response)}`
        );
      } catch (error) {
        this.logger.error(
          `Error fetching runs for pipeline ${pipeline.name}: ${error}`
        );
      }
    }

    if (!response) {
      throw new VError(
        `Failed to fetch runs for pipeline ${pipeline.name} in project ${project.name}`
      );
    }

    // Handle Azure DevOps Server (2020) which can have JSON with a value property
    const runs: AzureRun[] = Array.isArray(response)
      ? response
      : response.value || [];

    for (const run of runs) {
      const finishedDate = Utils.toDate(run.finishedDate);
      const state =
        restResponse && run.state
          ? (run.state as any as string)?.toLowerCase()
          : RunState[run.state]?.toLowerCase();
      if (state === 'completed' && cutoff >= finishedDate) {
        continue;
      }
      const build = await this.getBuild(project.id, run.id);
      const result =
        restResponse && run.result
          ? (run.result as any as string)?.toLowerCase()
          : RunResult[run.result]?.toLowerCase();
      yield {
        ...run,
        state,
        result,
        project,
        artifacts: build.artifacts,
        coverageStats: build.coverageStats,
        stages: build.stages,
        queueTime: build.queueTime,
        repository: build.repository,
        reason: BuildReason[build.reason]?.toLowerCase(),
        sourceBranch: build.sourceBranch,
        sourceVersion: build.sourceVersion,
        tags: build.tags,
        triggerInfo: build.triggerInfo,
      };
    }
  }

  async getBuild(projectId: string, buildId: number): Promise<Build> {
    const build = await this.client.build.getBuild(projectId, buildId);
    const coverageStats = await this.getCoverageStats(projectId, build);

    // https://learn.microsoft.com/en-us/rest/api/azure/devops/build/artifacts/list
    const artifacts =
      (await this.client.build.getArtifacts(projectId, build.id)) ?? [];

    const stages = await this.getJobs(projectId, build.id);
    return {
      ...build,
      coverageStats,
      artifacts,
      stages,
    };
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
    return timeline.records.map((r) => ({
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
}
