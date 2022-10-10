import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {CircleCICommon, CircleCIConverter} from './common';
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
    const projectUid = CircleCICommon.getProject(project.slug);
    const orgUid = CircleCICommon.getOrganization(project.slug);
    const res: DestinationRecord[] = [];
    res.push({
      model: 'cicd_Organization',
      record: {
        uid: orgUid,
        name: project.organization_name,
        source,
      },
    });
    res.push({
      model: 'cicd_Pipeline',
      record: {
        uid: projectUid,
        name: project.name,
        organization: {uid: orgUid, source},
      },
    });
    return res;
  }
}
