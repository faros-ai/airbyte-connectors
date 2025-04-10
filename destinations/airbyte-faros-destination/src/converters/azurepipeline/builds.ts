import {CodeCoverageStatistics} from 'azure-devops-node-api/interfaces/TestInterfaces';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Build} from 'faros-airbyte-common/azure-devops';
import {Utils} from 'faros-js-client';

import {getOrganizationFromUrl} from '../common/azure-devops';
import {BuildKey} from '../common/cicd';
import {Tag} from '../common/common';
import {CommitKey, RepoKey} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzurePipelineConverter} from './common';

export class Builds extends AzurePipelineConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Artifact',
    'cicd_ArtifactCommitAssociation',
    'cicd_Build',
    'cicd_BuildStep',
    'cicd_BuildCommitAssociation',
    'cicd_Repository',
    'cicd_BuildTag',
    'faros_Tag',
    'qa_CodeQuality',
  ];

  private readonly seenRepositories = new Set<string>();
  private readonly seenTags = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const build = record.record.data as Build;
    const uid = String(build.id);

    const organizationName = getOrganizationFromUrl(build.url);
    if (!organizationName) {
      ctx?.logger.warn(`Build ${uid} has no organization name`);
      return [];
    }

    const organization = this.getOrgKey(organizationName);
    const pipelineKey = {
      uid: String(build.definition?.id),
      organization,
    };

    const buildKey = {uid, pipeline: pipelineKey};
    const createdAt = Utils.toDate(build.queueTime);
    const startedAt = Utils.toDate(build.startTime);
    const endedAt = Utils.toDate(build.finishTime);
    const status = this.convertBuildState(build.result);
    const res: DestinationRecord[] = [];

    res.push({
      model: 'cicd_Build',
      record: {
        ...buildKey,
        name: build.buildNumber,
        createdAt,
        startedAt,
        endedAt,
        status,
        url: build.url,
      },
    });

    res.push(...this.processTags(build.tags, buildKey));

    if (build.sourceVersion && build.repository) {
      const vcsRepository = this.vcs_Repository(build.repository);
      const commitKey = {
        uid: build.sourceVersion,
        sha: build.sourceVersion,
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
          ...this.processCoverageStats(build, vcsRepository, commitKey, ctx)
        );
      }

      const cicdRepoUid = `${build.repository.type}:${build.repository.id}`;
      const cicdRepoKey = {
        uid: cicdRepoUid,
        organization,
      };
      if (!this.seenRepositories.has(cicdRepoUid)) {
        this.seenRepositories.add(cicdRepoUid);
        res.push({
          model: 'cicd_Repository',
          record: {
            ...cicdRepoKey,
            name: build.repository.name,
            description: null,
            url: build.repository.url,
          },
        });
      }

      for (const artifact of build.artifacts) {
        const tags: Tag[] = [];
        for (const [key, value] of Object.entries(
          artifact.resource.properties
        )) {
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
            createdAt: endedAt,
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
    }

    for (const job of build.jobs) {
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

  private processCoverageStats(
    build: Build,
    repoKey: RepoKey,
    commitKey: CommitKey,
    ctx?: StreamContext
  ): DestinationRecord[] {
    if (!build.coverageStats?.length) {
      return [];
    }

    const prKey = build.triggerInfo?.['pr.number']
      ? {
          uid: build.triggerInfo?.['pr.number'],
          number: Number(build.triggerInfo?.['pr.number']),
          repository: repoKey,
        }
      : undefined;

    const res: DestinationRecord[] = [];
    for (const coverage of build.coverageStats) {
      const measures = this.getMeasures(coverage, ctx);
      if (Object.keys(measures).length) {
        res.push({
          model: 'qa_CodeQuality',
          record: {
            ...measures,
            uid: commitKey.sha,
            createdAt: Utils.toDate(build.finishTime),
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
}
