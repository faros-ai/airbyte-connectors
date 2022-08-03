import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {SemaphoreCICommon, SemaphoreCIConverter} from './common';
import {Pipeline} from './models';

export class Pipelines extends SemaphoreCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
    'cicd_Build',
    'cicd_BuildCommitAssociation',
  ];

  private readonly projectsStream = new StreamName(this.source, 'projects');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.projectsStream];
  }

  id(record: AirbyteRecord): any {
    return record?.record?.data?.ppl_id;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const pipelineRecord = record.record.data as Pipeline;
    const source = this.streamName.source;

    const project = ctx.get(
      this.projectsStream.asString,
      String(pipelineRecord.project_id)
    );
    const repository = project?.record?.data?.spec.repository;

    /*
     * Pipeline
     */
    const organizationKey = {
      uid: project?.record?.data?.metadata.org_id,
      source,
    };

    const pipeline = {
      model: 'cicd_Pipeline',
      record: {
        uid: pipelineRecord.name,
        name: pipelineRecord.name,
        organization: organizationKey,
      },
    };

    /*
     * Build
     */
    const buildKey = {
      uid: pipeline.record.uid,
      organization: organizationKey,
    };

    const build = {
      model: 'cicd_Build',
      record: {
        uid: pipelineRecord.ppl_id,
        name: pipelineRecord.name,
        createdAt: pipelineRecord.created_at,
        startedAt: pipelineRecord.running_at,
        endedAt: pipelineRecord.done_at,
        url: SemaphoreCICommon.buildPipelineUrl(pipelineRecord, repository),
        status: SemaphoreCICommon.convertBuildState(pipelineRecord.result),
        pipeline: buildKey,
      },
    };

    /*
     * BuildCommitAssociation
     */
    const repositoryKey = {
      uid: pipelineRecord.project_id,
      organization: organizationKey,
    };

    pipelineRecord.commit_sha;

    const buildCommitAssociation = {
      model: 'cicd_BuildCommitAssociation',
      record: {
        build: buildKey,
        commit: {
          sha: pipelineRecord.commit_sha,
          uid: pipelineRecord.commit_sha,
          repository: repositoryKey,
        },
      },
    };

    return [pipeline, build, buildCommitAssociation];
  }
}
