import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OctopusConverter} from './common';
import {Project} from './models';

export class Projects extends OctopusConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['org_Project'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project = record.record.data as Project;
    const res: DestinationRecord[] = [];
    const uid = project.Id;
    // const lead =
    // project.owners.length >= 1
    //     ? {
    //         uid: project.owners[0],
    //         source,
    //       }
    //     : undefined;

    res.push({
      model: 'org_Project',
      record: {
        uid,
        projectGroupId: project.ProjectGroupId,
        description: project.Description,
        source,
        variableSetId: project.VariableSetId,
        deploymentProcessId: project.DeploymentProcessId,
        name: project.Name,
        slug: project.Slug,
        lifecycleId: project.LifecycleId,
      },
    });

    // for (const user of project.members ?? []) {
    //   res.push({
    //     model: 'org_TeamMembership',
    //     record: {
    //       team: {uid},
    //       member: {uid: user},
    //     },
    //   });
    // }
    return res;
  }
}
