import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Deployment} from '../models';
import {Octopus, OctopusConfig} from '../octopus';

interface DeploymentState {
  [spaceName: string]: {
    lastDeploymentId: string;
  };
}

export class Deployments extends AirbyteStreamBase {
  idNumRegex = new RegExp(/^Deployments-(.*)$/);

  constructor(
    private readonly config: OctopusConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/deployments.json');
  }
  get primaryKey(): StreamKey {
    return 'Id';
  }
  get cursorField(): string | string[] {
    return 'Id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: any,
    streamState?: DeploymentState
  ): AsyncGenerator<Deployment> {
    const octopus = await Octopus.instance(this.config, this.logger);
    const checkpoints =
      syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    yield* octopus.getDeployments(checkpoints);
  }

  getUpdatedState(
    currentStreamState: DeploymentState,
    latestRecord: Deployment
  ): DeploymentState {
    const spaceName = latestRecord.SpaceName;
    const lastId = currentStreamState[spaceName]?.lastDeploymentId;
    const currentIdNum = lastId ? +lastId.match(this.idNumRegex)[1] : 0;
    const latestIdNum = +latestRecord.Id.match(this.idNumRegex)[1];
    if (currentIdNum < latestIdNum) {
      return {
        ...currentStreamState,
        [spaceName]: {lastDeploymentId: latestRecord.Id},
      };
    }
    return currentStreamState;
  }
}
