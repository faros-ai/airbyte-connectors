import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Build, BuildkiteConverter} from './common';

export class BuildkiteBuilds extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
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
    const repo = build.pipeline?.repository;
    if (repo) {
      const repoExtract = this.extractRepo(repo.url);
      if (repoExtract) {
        const repoKey = {
          organization: {uid: toLower(repoExtract.org), source},
          name: toLower(repoExtract.name),
        };
        res.push({
          model: 'cicd_BuildCommitAssociation',
          record: {
            build: {uid: build.uuid, pipeline},
            commit: {repository: repoKey, sha: build.commit},
          },
        });
      }
    }
    return res;
  }
}
