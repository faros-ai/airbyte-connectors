import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {Build, BuildkiteConverter} from './common';

export class Builds extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
    'cicd_BuildStep',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const build = record.record.data as Build;

    if (!build.pipeline) return [];

    const pipeline = {
      uid: build.pipeline.slug,
      organization: {uid: build.pipeline.organization.slug, source},
    };
    const createdAt = Utils.toDate(build.createdAt);
    const startedAt = Utils.toDate(build.startedAt);
    const endedAt = Utils.toDate(build.finishedAt);
    const status = this.convertBuildState(build.state);
    const res: DestinationRecord[] = [];

    const buildKey = {
      uid: build.uuid,
      pipeline,
    };
    res.push({
      model: 'cicd_Build',
      record: {
        uid: build.uuid,
        name: build.message,
        number: build.number,
        createdAt,
        startedAt,
        endedAt,
        status,
        url: build.url,
        pipeline,
      },
    });
    for (const job of build.jobs) {
      res.push({
        model: 'cicd_BuildStep',
        record: {
          uid: job.uuid,
          name: job.label,
          ...this.convertBuildStepTime(job),
          command: job.command,
          type: this.convertBuildStepType(job.type),
          createdAt: Utils.toDate(job.createdAt),
          startedAt: Utils.toDate(job.startedAt),
          endedAt: Utils.toDate(job.finishedAt),
          status: this.convertBuildStepState(job.state),
          url: job.url,
          build: buildKey,
        },
      });
    }
    const repo = build.pipeline?.repository;
    if (repo) {
      const repoExtract = this.extractRepo(repo.url);
      if (repoExtract) {
        const repoKey = {
          organization: {uid: toLower(repoExtract.org), source},
          name: toLower(repoExtract.name),
          uid: toLower(repoExtract.name),
        };
        res.push({
          model: 'cicd_BuildCommitAssociation',
          record: {
            build: buildKey,
            commit: {repository: repoKey, sha: build.commit, uid: build.commit},
          },
        });
      }
    }
    return res;
  }
}
