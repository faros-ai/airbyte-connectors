import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';
import normalizeUrl from 'normalize-url';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {TravisCICommon, TravisCIConverter} from './common';
import {OrganizationKey, Repository, VCSOrganizationKey} from './models';

export class Repositores extends TravisCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
    'vcs_Organization',
    'vcs_Repository',
  ];
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const repository = record.record.data as Repository;
    const res: DestinationRecord[] = [];

    const organizationKey: OrganizationKey = {
      uid: toLower(repository.owner.login),
      source,
    };
    const maxDescriptionLength = this.maxDescriptionLength(ctx);
    const vcsOrganizationKey: VCSOrganizationKey = {
      uid: toLower(repository.owner.login),
      source: TravisCICommon.parseVCSType(repository.vcs_type),
    };
    res.push({
      model: 'cicd_Pipeline',
      record: {
        organization: organizationKey,
        uid: toLower(repository.slug),
        name: repository.name,
        description: repository.description?.substring(0, maxDescriptionLength),
        url: normalizeUrl(this.travisciUrl(ctx).concat(repository.href)),
      },
    });
    res.push({
      model: 'vcs_Organization',
      record: {
        uid: toLower(repository.owner.login),
        name: repository.owner.name,
        htmlUrl: undefined,
        type: TravisCICommon.convertVCSOwnerType(repository.owner.type),
        source: TravisCICommon.parseVCSType(repository.vcs_type),
      },
    });
    res.push({
      model: 'vcs_Repository',
      record: {
        name: toLower(repository.vcs_name),
        fullName: repository.slug,
        private: repository.private,
        description: repository.description,
        language: repository.github_language,
        size: undefined,
        mainBranch: repository.default_branch.name,
        htmlUrl: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        organization: vcsOrganizationKey,
      },
    });
    return res;
  }
}
