import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {Workspace} from '../bitbucket/types';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketServerConverter} from './common';

export class Projects extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const workspace = record.record.data as Workspace;

    return [
      {
        model: 'vcs_Organization',
        record: {
          uid: workspace.slug.toLowerCase(),
          name: workspace.name,
          type: {category: 'Workspace'},
          htmlUrl: workspace.links.htmlUrl,
          createdAt: Utils.toDate(workspace.createdOn),
          source,
        },
      },
    ];
  }
}
