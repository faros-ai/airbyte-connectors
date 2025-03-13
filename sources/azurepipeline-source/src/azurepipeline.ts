import {
  Build as AzureBuild,
  BuildQueryOrder,
  BuildReason,
  BuildResult,
  BuildStatus,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {
  Release,
  ReleaseQueryOrder,
} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {
  CodeCoverageStatistics,
  CoverageDetailedSummaryStatus,
} from 'azure-devops-node-api/interfaces/TestInterfaces';
import {wrapApiError} from 'faros-airbyte-cdk';
import {AzureDevOps} from 'faros-airbyte-common/azure-devops';
import {Utils} from 'faros-js-client';
import {DateTime} from 'luxon';
import {VError} from 'verror';

import * as types from './types';

export class AzurePipelines extends AzureDevOps {
  async checkConnection(projects?: ReadonlyArray<string>): Promise<void> {
    try {
      const allProjects = await this.getProjects(projects);
      if (!allProjects.length) {
        throw new VError('Failed to fetch projects');
      }
      const iter = this.getPipelines(allProjects[0]);
      await iter.next();
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

  // TODO: Use generic pagination function
  async *getPipelines(project: TeamProject): AsyncGenerator<types.Pipeline> {
    let hasNext = true;
    const continuationToken = undefined;

    while (hasNext) {
      // TODO: do we use continuation token and top?
      const pipelines = await this.client.pipelines.listPipelines(project.id);

      for (const pipeline of pipelines) {
        yield {
          projectName: project.name,
          ...pipeline,
        };
      }

      // continuationToken = pipelines.headers[CONTINUATION_TOKEN_HEADER];
      hasNext = Boolean(continuationToken);
      this.logger.info(`Fetched ${pipelines.length} pipelines for ${project}`);

      this.logger.debug(
        hasNext
          ? `Fetching next pipelines page for project ${project.name}`
          : 'No more pipelines'
      );
    }
  }

  // https://docs.microsoft.com/en-us/rest/api/azure/devops/build/builds
  async *getBuilds(
    project: TeamProject,
    lastFinishTime?: number
  ): AsyncGenerator<types.Build> {
    const startTime = lastFinishTime
      ? Utils.toDate(lastFinishTime)
      : DateTime.now().minus({days: this.cutoffDays}).toJSDate();

    let hasNext = true;
    let continuationToken = undefined;
    let totalBuilds = 0;

    while (hasNext) {
      const builds = await this.client.build.getBuilds(
        project.id, // project id
        undefined, // definitions - array of definition ids
        undefined, // queues - array of queue ids
        undefined, // buildNumber - build number to search for
        startTime, // minTime - minimum build finish time
        undefined, // maxTime - maximum build finish time
        undefined, // requestedFor - team project ID
        undefined, // reasonFilter - build reason
        undefined, // statusFilter - build status
        undefined, // resultFilter - build result
        undefined, // tagFilters - build tags
        undefined, // properties - build properties
        this.top, // top - number of builds to return
        continuationToken, // continuationToken - token for pagination
        undefined, // maxBuildsPerDefinition - max builds per def
        undefined, // deletedFilter - include deleted builds
        BuildQueryOrder.FinishTimeAscending // queryOrder - sort order
      );

      totalBuilds += builds.length;
      this.logger.debug(
        `Fetched ${totalBuilds} builds for project ${project.name}`
      );

      for (const build of builds) {
        const coverageStats = await this.getCoverageStats(project.id, build);

        // https://learn.microsoft.com/en-us/rest/api/azure/devops/build/artifacts/list
        const artifacts = await this.client.build.getArtifacts(
          project.id,
          build.id
        );
        // https://learn.microsoft.com/en-us/rest/api/azure/devops/build/timeline/get
        const timeline = await this.client.build.getBuildTimeline(
          project.id,
          build.id
        );
        const jobs = timeline.records?.filter((r) => r.type === 'Job');
        yield {
          ...build,
          artifacts,
          jobs,
          coverageStats,
        };

        continuationToken = builds.continuationToken;
        hasNext = Boolean(continuationToken);
        this.logger.debug(
          hasNext
            ? `Fetching next builds page for project ${project.name}`
            : 'No more builds'
        );
      }
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

  async *getReleases(
    project: TeamProject,
    lastCreatedOn?: number
  ): AsyncGenerator<Release> {
    const startTime = lastCreatedOn
      ? Utils.toDate(lastCreatedOn)
      : DateTime.now().minus({days: this.cutoffDays}).toJSDate();
    let hasNext = true;
    let continuationToken = undefined;

    while (hasNext) {
      const releases = await this.client.release.getReleases(
        project.id,
        undefined, // definitionId
        undefined, // definitionEnvironmentId
        undefined, // searchText
        undefined, // createdBy
        undefined, // statusFilter
        undefined, // environmentStatusFilter
        startTime, // minCreatedTime
        undefined, // maxCreatedTime
        ReleaseQueryOrder.Ascending,
        this.top,
        continuationToken
      );
      this.logger.debug(
        `Fetched ${releases.length} releases for ${project.name}`
      );
      for (const release of releases) {
        yield release;
      }

      continuationToken = releases.continuationToken;
      hasNext = Boolean(continuationToken);

      this.logger.debug(
        hasNext ? 'Fetching next releases page' : 'No more releases'
      );
    }
  }
}
