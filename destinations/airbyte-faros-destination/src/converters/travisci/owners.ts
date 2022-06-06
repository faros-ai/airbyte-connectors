import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';
import normalizeUrl from 'normalize-url';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {TravisCIConverter} from './common';
import {Owner} from './models';

export class Owners extends TravisCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
  ];
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const owner = record.record.data as Owner;
    return [
      {
        model: 'cicd_Organization',
        record: {
          uid: toLower(owner.login),
          name: owner.name,
          url: normalizeUrl(this.travisciUrl(ctx).concat(owner.href)),
          source,
        },
      },
    ];
  }
}
