import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketConverter} from './common';
import {Workspace} from './types';

export class Projects extends BitbucketConverter {
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
