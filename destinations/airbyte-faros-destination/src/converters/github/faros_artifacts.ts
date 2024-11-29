import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Artifact} from 'faros-airbyte-common/github';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosArtifacts extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Artifact',
    'cicd_Repository',
  ];

  private readonly seenRepositories = new Set<string>();

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const artifact = record.record.data as Artifact;

    const repository = GitHubCommon.repoKey(
      artifact.org,
      artifact.repo,
      this.streamName.source
    );
    const pipeline = {
      uid: artifact.workflow_id.toString(),
      organization: repository.organization,
    };
    const build = {
      uid: artifact.run_id.toString(),
      pipeline,
    };

    const res: DestinationRecord[] = [];

    const orgRepoKey = toLower(`${artifact.org}/${artifact.repo}`);
    if (!this.seenRepositories.has(orgRepoKey)) {
      this.seenRepositories.add(orgRepoKey);
      res.push({
        model: 'cicd_Repository',
        record: {
          ...repository,
          name: repository.uid,
        },
      });
    }

    res.push({
      model: 'cicd_Artifact',
      record: {
        uid: artifact.id.toString(),
        name: artifact.name,
        url: artifact.url,
        createdAt: artifact.created_at,
        build,
        repository,
      },
    });

    return res;
  }
}
