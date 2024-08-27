import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Workspace} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketConverter, CategoryRef} from './common';

enum OrgTypeCategory {
  ORGANIZATION = 'Organization',
  WORKSPACE = 'Workspace',
  GROUP = 'Group',
  CUSTOM = 'Custom',
}

export class Workspaces extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const workspace = record.record.data as Workspace;

    return [
      {
        model: 'vcs_Organization',
        record: {
          uid: workspace.slug.toLowerCase(),
          name: workspace.name,
          type: this.VCSOrgType(workspace.type),
          htmlUrl: workspace.links.htmlUrl,
          createdAt: Utils.toDate(workspace.createdOn),
          source,
        },
      },
    ];
  }

  private VCSOrgType(type?: string): CategoryRef {
    const detail = type?.toLowerCase();
    if (detail === 'organization') {
      return {category: OrgTypeCategory.ORGANIZATION};
    } else if (detail === 'workspace') {
      return {category: OrgTypeCategory.WORKSPACE};
    } else if (detail === 'group') {
      return {category: OrgTypeCategory.GROUP};
    }
    return {category: OrgTypeCategory.CUSTOM, detail};
  }
}
