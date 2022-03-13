import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib';
import {toLower} from 'lodash';
import normalizeUrl from 'normalize-url';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BambooCommon, BambooConverter} from './common';
import {BuildKey, Deployment} from './models';

export class BambooDeployments extends BambooConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Deployment',
    'cicd_Organization',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const deployment = record.record.data as Deployment;
    const res: DestinationRecord[] = [];
    const baseUrl = this.baseUrl(ctx);

    if (!baseUrl) {
      return res;
    }
    const orgId = new URL(baseUrl).hostname;

    if (!orgId) {
      return res;
    }

    res.push({
      model: 'cicd_Organization',
      record: {
        uid: orgId,
        name: orgId,
        url: normalizeUrl(baseUrl),
        source,
      },
    });

    const startedDate = Utils.toDate(deployment.startedDate);
    const deploymentStatus = BambooCommon.convertDeploymentStatus(
      deployment.deploymentState
    );

    let buildKey: undefined | BuildKey = undefined;
    if (deployment.deploymentVersion.items?.length) {
      const {planResultKey} = deployment.deploymentVersion.items[0];
      buildKey = {
        uid: String(planResultKey.resultNumber),
        pipeline: {
          uid: toLower(planResultKey.entityKey.key),
          organization: {uid: orgId, source},
        },
      };
    }

    res.push({
      model: 'cicd_Deployment',
      record: {
        uid: String(deployment.id),
        build: buildKey,
        env: BambooCommon.convertEnvironmentStatus(deployment.environmentName),
        startedAt: startedDate,
        endedAt: Utils.toDate(deployment.finishedDate),
        status: deploymentStatus,
        source,
      },
    });
    return res;
  }
}
