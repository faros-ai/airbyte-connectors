import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OctopusConverter} from './common';
import {Deployment} from './models';

export class Deployments extends OctopusConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_Deployment',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const deployment = record.record.data as Deployment;
    const uid = deployment.Id;
    const res: DestinationRecord[] = [];

    res.push({
      model: 'org_Deployment',
      record: {
        uid,
        channelId: deployment.ChannelId,
        changes: deployment.Changes,
        changesMarkdown: deployment.ChangesMarkdown,
        comments: deployment.Comments,
        deployedBy: deployment.DeployedBy,
        deployedById: deployment.DeployedBy,
        created: deployment.Created,
        lastModifiedOn: deployment.LastModifiedOn,
        deployedToMachineIds: deployment.DeployedToMachineIds,
        deploymentProcessId: deployment.DeploymentProcessId,
        devironmentId: deployment.EnvironmentId,
        forcePackageRedeployment: deployment.ForcePackageRedeployment,
        failureEncountered: deployment.FailureEncountered,
        source,
      },
    });
    return res;
  }
}
