import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {SemaphoreCICommon, SemaphoreCIConverter} from './common';
import {Pipeline, Repository} from './models';

export class Pipelines extends SemaphoreCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
    'cicd_Build',
    'cicd_BuildCommitAssociation',
    'cicd_BuildSteps',
  ];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.ppl_id;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const pipelineRecord = record.record.data as Pipeline;
    const source = this.streamName.source;

    const project = pipelineRecord.project;
    const repository = project.spec.repository as Repository;
    const VCSSource = SemaphoreCICommon.getVCSSourceFromUrl(repository.url);

    /*
     * Pipeline
     */
    const organizationKey = {
      uid: repository.owner,
      name: repository.owner,
      source,
    };

    const pipeline = {
      model: 'cicd_Pipeline',
      record: {
        uid: `${project.metadata.name}-${pipelineRecord.name}`,
        name: pipelineRecord.name,
        organization: organizationKey,
      },
    };

    /*
     * Build
     */
    const pipelineKey = {
      uid: pipeline.record.uid,
      organization: organizationKey,
    };

    const build = {
      model: 'cicd_Build',
      record: {
        uid: pipelineRecord.ppl_id,
        name: pipelineRecord.name,
        createdAt: pipelineRecord.created_at,
        startedAt: SemaphoreCICommon.nullifyDate(pipelineRecord.running_at),
        endedAt: SemaphoreCICommon.nullifyDate(pipelineRecord.done_at),
        url: SemaphoreCICommon.buildPipelineUrl(pipelineRecord, repository),
        status: SemaphoreCICommon.convertBuildState(pipelineRecord.result),
        pipeline: pipelineKey,
      },
    };

    /*
     * BuildCommitAssociation
     */
    const repositoryKey = {
      uid: repository.name,
      name: repository.name,
      fullName: `${repository.owner}/${repository.name}`,
      url: SemaphoreCICommon.buildVCSUrls(repository, VCSSource).repository,
      organization: {
        uid: repository.owner,
        source: VCSSource,
        url: SemaphoreCICommon.buildVCSUrls(repository, VCSSource).organization,
      },
    };

    const buildCommitAssociation = {
      model: 'cicd_BuildCommitAssociation',
      record: {
        build: build.record,
        commit: {
          sha: pipelineRecord.commit_sha,
          uid: pipelineRecord.commit_sha,
          repository: repositoryKey,
        },
      },
    };

    const buildSteps = [];
    for (const job of pipelineRecord.jobs) {
      buildSteps.push({
        model: 'cicd_BuildStep',
        record: {
          uid: job.metadata.id,
          name: job.metadata.name,
          command: Utils.cleanAndTruncate(
            job.spec.commands.join('\n'),
            SemaphoreCICommon.MAX_DESCRIPTION_LENGTH
          ),
          createdAt: SemaphoreCICommon.nullifyDate(job.metadata.create_time),
          startedAt: SemaphoreCICommon.nullifyDate(job.metadata.start_time),
          endedAt: SemaphoreCICommon.nullifyDate(job.metadata.finish_time),
          status: SemaphoreCICommon.convertBuildState(job.status.result),
          url: SemaphoreCICommon.buildJobUrl(job, repository),
          build: build.record,
        },
      });
    }

    /*
     * BuildSteps
     */

    return [pipeline, build, buildCommitAssociation, ...buildSteps];
  }
}
