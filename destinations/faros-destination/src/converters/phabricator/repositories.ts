import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PhabricatorCommon, PhabricatorConverter} from './common';

export class PhabricatorRepositories extends PhabricatorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Repository',
    'vcs_Organization',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const repo = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = PhabricatorCommon.repositoryKey(repo, source);
    if (!repository) return res;

    const uris = PhabricatorCommon.repositoryURIs(repo);

    // Since there is no separate stream of organizations, we are writing
    // an organization with each repository.
    res.push({
      model: 'vcs_Organization',
      record: {
        uid: repository.organization.uid,
        name: repository.organization.uid,
        type: 'Organization',
        source,
      },
    });

    res.push({
      model: 'vcs_Repository',
      record: {
        ...repository,
        fullName: repo.fields?.name,
        private: true,
        description: repo.fields?.description?.raw,
        language: null,
        size: null,
        mainBranch: repo.fields?.defaultBranch,
        htmlUrl: uris.length > 0 ? uris[0].fields?.uri?.effective : null,
        createdAt: repo.fields?.dateCreated
          ? Utils.toDate(repo.fields.dateCreated * 1000)
          : null,
        updatedAt: repo.fields?.dateModified
          ? Utils.toDate(repo.fields.dateModified * 1000)
          : null,
      },
    });

    return res;
  }
}
