import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketConverter} from './common';
import {Workspace} from './types';

export class BitbucketWorkspaces extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const workspace = record.record.data as Workspace;

    return [
      {
        model: 'cicd_Organization',
        record: {
          uid: workspace.slug.toLowerCase(),
          name: workspace.name,
          url: workspace.links.htmlUrl,
          source,
        },
      },
    ];
  }
}
