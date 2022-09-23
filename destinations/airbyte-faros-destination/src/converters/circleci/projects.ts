import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {CircleCIConverter} from './common';
import {Project} from './models';

export class Projects extends CircleCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
    'cicd_Pipeline',
  ];
  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project = record.record.data as Project;
    const uid = toLower(project.id);
    const orgSlug = toLower(project.organization_slug);
    const res: DestinationRecord[] = [];
    res.push({
      model: 'cicd_Organization',
      record: {
        uid: orgSlug,
        name: project.organization_name,
        source,
      },
    });
    res.push({
      model: 'cicd_Pipeline',
      record: {
        uid,
        name: project.name,
        organization: {uid: orgSlug, source},
      },
    });
    return res;
  }
}
