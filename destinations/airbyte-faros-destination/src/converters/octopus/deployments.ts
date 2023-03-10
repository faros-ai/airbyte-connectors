import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OctopusConverter} from './common';

export class Deployments extends OctopusConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Deployment',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const deployment = record.record.data;

    res.push({
      model: 'cicd_Deployment',
      record: {
        uid: deployment.Id,
        application: {
          name: deployment._extra?.ProjectName,
          platform: '',
        },
        url: deployment.Links?.Self,
        requestedAt: Utils.toDate(deployment._extra?.Task?.QueueTime),
        startedAt: Utils.toDate(deployment._extra?.Task?.StartTime),
        endedAt: Utils.toDate(deployment._extra?.Task?.CompletedTime),
        env: this.convertOctopusEnvironment(deployment._extra?.EnvironmentName),
        status: this.convertOctopusStatus(
          deployment._extra?.Task?.State,
          deployment._extra?.Task?.ErrorMessage
        ),
        source,
      },
    });

    return res;
  }

  /**
   * Octopus task statuses include:
   * Canceled, Cancelling, Executing, Failed, Queued, Success, TimedOut
   */
  private convertOctopusStatus(
    octopusStatus: string | undefined,
    octopusErrMsg: string | undefined
  ): {
    category: string;
    detail: string;
  } {
    if (!octopusStatus) {
      return {category: 'Unknown', detail: 'undefined'};
    }
    const status = octopusStatus?.toLowerCase();
    const detail = `${octopusStatus}${
      octopusErrMsg ? ' - ' + octopusErrMsg : ''
    }`;

    switch (status) {
      case 'canceled':
      case 'cancelling':
        return {category: 'Canceled', detail};
      case 'executing':
        return {category: 'Running', detail};
      case 'failed':
        return {category: 'Failed', detail};
      case 'success':
        return {category: 'Success', detail};
      case 'queued':
        return {category: 'Queued', detail};
      default:
        return {category: 'Custom', detail};
    }
  }

  private convertOctopusEnvironment(octopusEnv: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!octopusEnv) {
      return {category: 'Unknown', detail: 'undefined'};
    }
    const env = octopusEnv?.toLowerCase();
    const detail = octopusEnv;

    switch (env) {
      case 'production':
      case 'prod':
        return {category: 'Prod', detail};
      case 'staging':
        return {category: 'Staging', detail};
      case 'qa':
        return {category: 'QA', detail};
      case 'development':
      case 'develop':
      case 'dev':
        return {category: 'Dev', detail};
      case 'sandbox':
        return {category: 'Sandbox', detail};
      case 'canary':
        return {category: 'Canary', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
