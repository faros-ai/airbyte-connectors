import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzurePipelineConverter} from './common';
import {Build, Tag} from './models';

export class Builds extends AzurePipelineConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Artifact',
    'cicd_Build',
    'cicd_BuildStep',
    'cicd_Repository',
  ];

  private seenRepositories = new Set<string>();

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const build = record.record.data as Build;
    const uid = String(build.id);

    const organizationName = this.getOrganizationFromUrl(build.url);
    const organization = {uid: organizationName, source};
    const pipeline = {
      uid: String(build.definition?.id),
      organization: {uid: organizationName, source},
    };
    const buildUid = {uid, pipeline};
    const createdAt = Utils.toDate(build.queueTime);
    const startedAt = Utils.toDate(build.startTime);
    const endedAt = Utils.toDate(build.finishTime);
    const status = this.convertBuildState(build.result);
    const res: DestinationRecord[] = [];

    const number = Number(build.buildNumber.replace('.', ''));
    res.push({
      model: 'cicd_Build',
      record: {
        uid,
        name: build.buildNumber,
        number,
        createdAt,
        startedAt,
        endedAt,
        status,
        url: build.url,
        pipeline,
      },
    });
    // TODO
    const repo = build.repository;
    if (!this.seenRepositories.has(repo.id)) {
      this.seenRepositories.add(repo.id);
      res.push({
        model: 'cicd_Repository',
        record: {
          uid: repo.id,
          name: repo.name,
          description: null,
          url: this.getRepoUrl(repo),
          organization,
        },
      });
    }

    for (const job of build.jobs) {
      if (job.type != 'Job') {
        continue;
      }
      const jobCreatedAt = Utils.toDate(job.startTime);
      const jobStartedAt = Utils.toDate(job.startTime);
      const jobEndedAt = Utils.toDate(job.finishTime);
      const jobStatus = this.convertBuildStepState(job.result);

      // get the parent job
      let parentJob = job;
      while (parentJob.parentId)
        parentJob = build.jobs.find((j) => j.id == parentJob.parentId);

      // we put the parent stage as the detail
      const jobType = this.convertBuildStepType(parentJob.name);

      res.push({
        model: 'cicd_BuildStep',
        record: {
          uid: String(job.id),
          name: job.name,
          command: job.name,
          type: jobType,
          createdAt: jobCreatedAt,
          startedAt: jobStartedAt,
          endedAt: jobEndedAt,
          status: jobStatus,
          url: job.url,
          build: buildUid,
        },
      });
    }

    for (const artifact of build.artifacts) {
      const artifactCreatedAt = Utils.toDate(build.startTime);
      const tags: Tag[] = [];
      for (const [key, value] of Object.entries(artifact.resource.properties)) {
        tags.push({name: key, value: String(value)});
      }
      res.push({
        model: 'cicd_Artifact',
        record: {
          uid: String(artifact.id),
          name: artifact.name,
          url: artifact.resource.url,
          type: artifact.resource.type,
          createdAt: artifactCreatedAt,
          tags,
          build: buildUid,
          repository: {uid: repo.id, organization},
        },
      });
    }
    return res;
  }
}
