import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {CircleCICommon, CircleCIConverter} from './common';
import {Project} from './models';

export class Projects extends CircleCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
    'cicd_Pipeline',
  ];

  private seenOrganizations: Set<string> = new Set<string>();

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project = record.record.data as Project;
    const projectUid = CircleCICommon.getProject(project.slug);
    const orgUid = CircleCICommon.getOrganization(project.slug);
    const res: DestinationRecord[] = [];
    const organizationKey = this.getOrganizationKey(
      orgUid,
      project.organization_name
    );
    // avoiding writing the same organization multiple times to reduce runtime
    if (!this.seenOrganizations.has(organizationKey)) {
      res.push({
        model: 'cicd_Organization',
        record: {
          uid: orgUid,
          name: project.organization_name,
          source,
        },
      });
      this.seenOrganizations.add(organizationKey);
    }
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

  private getOrganizationKey(orgUid: string, organizationName: string): string {
    // gets a key that is unique for the organization to avoid duplicates
    return `${orgUid}__${organizationName}`;
  }
}
