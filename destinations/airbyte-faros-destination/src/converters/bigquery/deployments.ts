import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {BigQueryConverter} from './common';

export class Deployments extends BigQueryConverter {
  id(record: AirbyteRecord): string {
    return record.record.data.id;
  }
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_Deployment',
    'vcs_Commit',
    'cicd_DeploymentChangeset'
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];

    //cicd_Deployment
    const uid = record.record.data.uid;
    const startedAt = record.record.data.started_at;
    const endedAt = record.record.data.ended_at;
    const env = record.record.data.env;
    const status = record.record.data.status;
    const url = record.record.data.url;
    const source = record.record.data.source || this.source;

    //cicd_Build
    const buildUid = `${record.record.data.build_uid}`;
    const buildNumber = record.record.data.build_number;
    const buildUrl = record.record.data.url;

    //vcs_Commit & cicd_DeploymentChangeset
    const commit = record.record.data.commit_sha;

    if (uid) {
      res.push({
        model: 'cicd_Deployment',
        record: {
          uid: uid,
          startedAt: startedAt,
          endedAt: endedAt,
          env: env,
          status: status,
          url: url,
          source: source,
          build: {
            uid: buildUid,
          },
          changeset: {
            commit: {
              sha: commit,
            },
          },
        },
      });
    }

    if (buildUid) {
      res.push({
        model: 'cicd_Build',
        record: {
          uid: buildUid,
          number: buildNumber,
          url: buildUrl,
        },
      });
    }

    if (commit) {
      res.push({
        model: 'vcs_Commit',
        record: {
          sha: commit,
        },
      });

      res.push({
        model: 'cicd_DeploymentChangeset',
        record: {
          commit: {
            sha: commit,
          },
          deployment: {
            uid: uid,
            source: source,
          },
        },
      });
    }

    return res;
  }
}
