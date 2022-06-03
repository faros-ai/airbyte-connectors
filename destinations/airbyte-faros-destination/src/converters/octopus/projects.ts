import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OctopusConverter} from './common';
import {Project} from './models';

export class Projects extends OctopusConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
  ];

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
      model: 'cicd_Pipeline',
      record: {
        uid,
        spaceId: project.SpaceId,
        clonedFromProjectId: project.ClonedFromProjectId,
        discreteChannelRelease: project.DiscreteChannelRelease,
        includedLibraryVariableSetIds: project.IncludedLibraryVariableSetIds,
        defaultToSkipIfAlreadyInstalled:
          project.DefaultToSkipIfAlreadyInstalled,
        tenantedDeploymentMode: project.TenantedDeploymentMode,
        defaultGuidedFailureMode: project.DefaultGuidedFailureMode,
        versioningStrategy: project.VersioningStrategy,
        releaseCreationStrategy: project.ReleaseCreationStrategy,
        projectGroupId: project.ProjectGroupId,
        isDisabled: project.IsDisabled,
        autoCreateRelease: project.AutoCreateRelease,
        description: project.Description,
        isVersionControlled: project.IsVersionControlled,
        persistenceSettings: project.PersistenceSettings,
        projectConnectivityPolicy: project.ProjectConnectivityPolicy,
        source,
        variableSetId: project.VariableSetId,
        deploymentProcessId: project.DeploymentProcessId,
        name: project.Name,
        slug: project.Slug,
        lifecycleId: project.LifecycleId,
        link: project.Link,
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
