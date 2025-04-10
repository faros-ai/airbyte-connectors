import {Run} from 'faros-airbyte-common/azure-devops';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzurePipelineConverter} from './common';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {getOrganization} from '../common/azure-devops';
import {CategoryDetail, Tag} from '../common/common';
import {BuildKey, BuildStateCategory} from '../common/cicd';
import {Utils} from 'faros-js-client';
import {BuildRepository} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {CommitKey, OrgKey, RepoKey} from '../common/vcs';
import {CodeCoverageStatistics} from 'azure-devops-node-api/interfaces/TestInterfaces';
export class Runs extends AzurePipelineConverter {
  private readonly seenRepositories = new Set<string>();
  private readonly seenTags = new Set<string>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = ['cicd_Build'];
  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const run = record.record.data as Run;
    const res: DestinationRecord[] = [];

    const organizationName = getOrganization(run.url, ctx);
    if (!organizationName) {
      ctx.logger.error(
        `No organization found for run ${run.id}. URL: ${run.url}`
      );
      return [];
    }

    // TODO: Merge with orgKey alignment
    const pipeline = {
      uid: String(run.pipeline?.id),
      organization: {uid: organizationName.toLowerCase(), source},
    };

    const runKey = {
      uid: String(run.id),
      pipeline,
    };

    res.push(...this.processTags(run.tags, runKey));
    res.push(...this.processCommit(run, runKey));
    res.push(...this.processStages(run, runKey));

    // Add build number revision???
    const status = this.convertRunState(run.result);
    res.push({
      model: 'cicd_Build',
      record: {
        ...runKey,
        name: run.name,
        createdAt: Utils.toDate(run.queueTime),
        startedAt: Utils.toDate(run.createdDate),
        endedAt: Utils.toDate(run.finishedDate),
        status,
        url: run._links?.web?.href ?? run.url,
      },
    });
    return res;
  }

  // Read more on Azure pipeline run result:
  // https://learn.microsoft.com/en-us/rest/api/azure/devops/pipelines/runs/list?view=azure-devops-rest-7.1#runresult

  private convertRunState(result: string | undefined): CategoryDetail {
    if (!result) {
      return;
    }
    switch (result) {
      case 'canceled':
        return {category: BuildStateCategory.Canceled, detail: result};
      case 'failed':
        return {category: BuildStateCategory.Failed, detail: result};
      case 'succeeded':
        return {category: BuildStateCategory.Success, detail: result};
      default:
        return {category: BuildStateCategory.Custom, detail: result};
    }
  }

  private processTags(tags: string[], buildKey: BuildKey): DestinationRecord[] {
    const results = [];
    for (const tag of tags ?? []) {
      const tagKey = {uid: tag};
      results.push({
        model: 'cicd_BuildTag',
        record: {
          build: buildKey,
          tag: tagKey,
        },
      });

      if (this.seenTags.has(tag)) {
        continue;
      }
      this.seenTags.add(tag);
      results.push({
        model: 'faros_Tag',
        record: {
          ...tagKey,
          key: tag,
        },
      });
    }
    return results;
  }

  private processCommit(
    run: Run,
    buildKey: BuildKey,
    ctx?: StreamContext
  ): DestinationRecord[] {
    if (!run.sourceVersion || !run.repository) {
      return [];
    }
    const res = [];
    const {sourceVersion, repository} = run;
    const vcsRepository = this.vcs_Repository(repository);
    const commitKey = {
      uid: sourceVersion,
      sha: sourceVersion,
      repository: vcsRepository,
    };
    if (vcsRepository) {
      res.push({
        model: 'cicd_BuildCommitAssociation',
        record: {
          build: buildKey,
          commit: commitKey,
        },
      });
      res.push(
        ...this.processCoverageStats(run, vcsRepository, commitKey, ctx)
      );
    }

    const cicdRepoUid = `${repository.type}:${repository.id}`;
    const cicdRepoKey = {
      uid: cicdRepoUid,
      organization: buildKey.pipeline.organization,
    };
    if (!this.seenRepositories.has(cicdRepoUid)) {
      this.seenRepositories.add(cicdRepoUid);
      res.push({
        model: 'cicd_Repository',
        record: {
          ...cicdRepoKey,
          name: run.repository.name,
          description: null,
          url: run.repository.url,
        },
      });
    }

    for (const artifact of run.artifacts) {
      const tags: Tag[] = [];
      for (const [key, value] of Object.entries(artifact.resource.properties)) {
        tags.push({name: key, value: String(value)});
      }
      const artifactKey = {
        uid: String(artifact.id),
        repository: cicdRepoKey,
      };
      res.push({
        model: 'cicd_Artifact',
        record: {
          ...artifactKey,
          name: artifact.name,
          url: artifact.resource.url,
          type: artifact.resource.type,
          createdAt: Utils.toDate(run.finishedDate),
          tags,
          build: buildKey,
        },
      });
      if (vcsRepository) {
        res.push({
          model: 'cicd_ArtifactCommitAssociation',
          record: {
            artifact: artifactKey,
            commit: commitKey,
          },
        });
      }
    }
    return res;
  }

  private processCoverageStats(
    run: Run,
    repoKey: RepoKey,
    commitKey: CommitKey,
    ctx?: StreamContext
  ): DestinationRecord[] {
    if (!run.coverageStats?.length) {
      return [];
    }

    const {triggerInfo} = run;
    const prKey = triggerInfo?.['pr.number']
      ? {
          uid: triggerInfo?.['pr.number'],
          number: Number(triggerInfo?.['pr.number']),
          repository: repoKey,
        }
      : undefined;

    const res: DestinationRecord[] = [];
    for (const coverage of run.coverageStats) {
      const measures = this.getMeasures(coverage, ctx);
      if (Object.keys(measures).length) {
        res.push({
          model: 'qa_CodeQuality',
          record: {
            ...measures,
            uid: commitKey.sha,
            createdAt: Utils.toDate(run.finishedDate),
            pullRequest: prKey,
            commit: commitKey,
            repository: repoKey,
          },
        });
      }
    }
    return res;
  }

  private getMeasures(
    coverage: CodeCoverageStatistics,
    ctx?: StreamContext
  ): any {
    switch (coverage.label) {
      case 'Lines':
        return {
          linesToCover: {
            category: 'Coverage',
            name: 'Lines to Cover',
            type: 'Int',
            value: String(coverage.total),
          },
          uncoveredLines: {
            category: 'Coverage',
            name: 'Uncovered Lines',
            type: 'Int',
            value: String(coverage.total - coverage.covered),
          },
          lineCoverage: {
            category: 'Coverage',
            name: 'Line Coverage',
            type: 'Percent',
            value: String(
              coverage.total ? (coverage.covered / coverage.total) * 100 : 0
            ),
          },
        };
      default:
        ctx?.logger.warn(`Unsupported coverage label: ${coverage.label}`);
        return {};
    }
  }

  private processStages(run: Run, buildKey: BuildKey): DestinationRecord[] {
    const res: DestinationRecord[] = [];
    for (const job of run.stages ?? []) {
      const jobCreatedAt = Utils.toDate(job.startTime);
      const jobStartedAt = Utils.toDate(job.startTime);
      const jobEndedAt = Utils.toDate(job.finishTime);
      const jobStatus = this.convertBuildStepState(job.result);
      const jobType = this.convertBuildStepType(job.type);

      res.push({
        model: 'cicd_BuildStep',
        record: {
          uid: String(job.id),
          build: buildKey,
          name: job.name,
          command: job.name,
          type: jobType,
          createdAt: jobCreatedAt,
          startedAt: jobStartedAt,
          endedAt: jobEndedAt,
          status: jobStatus,
          url: job.url,
        },
      });
    }
    return res;
  }
}
