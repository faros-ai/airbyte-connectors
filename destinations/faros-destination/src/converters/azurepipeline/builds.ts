import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzurepipelineConverter} from './common';
import {Build, Tag} from './models';

export class AzurepipelineBuilds extends AzurepipelineConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Artifact',
    'cicd_Build',
    'cicd_BuildStep',
    'cicd_Repository',
  ];

  private seenRepositories = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const build = record.record.data as Build;
    const uid = String(build.id);
    const buildUid = {uid, source};
    const organizationName = this.getOrganizationFromUrl(build.url);
    const organization = {uid: organizationName, source};
    const pipeline = {
      uid: String(build.definition?.id),
      organization: {uid: organizationName, source},
    };
    const createdAt = Utils.toDate(build.queueTime);
    const startedAt = Utils.toDate(build.startTime);
    const endedAt = Utils.toDate(build.finishTime);
    const status = this.convertBuildState(build.result);
    const res: DestinationRecord[] = [];

    res.push({
      model: 'cicd_Build',
      record: {
        uid: uid,
        name: build.buildNumber,
        number: build.buildNumber,
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
      const createdAt = Utils.toDate(job.startTime);
      const startedAt = Utils.toDate(job.startTime);
      const endedAt = Utils.toDate(job.finishTime);
      const status = this.convertBuildStepState(job.result);
      const type = this.convertBuildStepType(job.type);

      res.push({
        model: 'cicd_BuildStep',
        record: {
          uid: String(job.id),
          name: job.name,
          command: job.name,
          type,
          createdAt,
          startedAt,
          endedAt,
          status,
          url: job.url,
          build: buildUid,
        },
      });
    }

    for (const artifact of build.artifacts) {
      const createdAt = Utils.toDate(build.startTime);
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
          createdAt,
          tags,
          build: buildUid,
          repository: {uid: repo.id, source},
        },
      });
    }
    return res;
  }
}
