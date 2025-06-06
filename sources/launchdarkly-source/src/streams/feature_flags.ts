import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {LaunchDarkly} from '../launchdarkly';

export interface FeatureFlagsState {
  lastModified: Date;
}

export class FeatureFlags extends AirbyteStreamBase {
  constructor(
    private readonly launchdarkly: LaunchDarkly,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/feature_flag.json');
  }

  get primaryKey(): StreamKey {
    return ['key'];
  }

  get cursorField(): string | string[] {
    return ['_lastModified'];
  }

  getUpdatedState(
    currentStreamState: FeatureFlagsState,
    latestRecord: any
  ): FeatureFlagsState {
    const latestModified = currentStreamState?.lastModified
      ? new Date(currentStreamState.lastModified).getTime()
      : 0;
    const recordModified = latestRecord?._lastModified
      ? new Date(latestRecord._lastModified).getTime()
      : 0;
    return {
      lastModified: new Date(Math.max(latestModified, recordModified)),
    };
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    _streamSlice?: Dictionary<any, string>,
    streamState?: FeatureFlagsState
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    for await (const project of this.launchdarkly.getProjects()) {
      for await (const flag of this.launchdarkly.getFeatureFlags(project.key)) {
        if (syncMode === SyncMode.INCREMENTAL && streamState?.lastModified) {
          const flagModified = flag._lastModified
            ? new Date(flag._lastModified).getTime()
            : 0;
          const stateModified = new Date(streamState.lastModified).getTime();
          if (flagModified <= stateModified) {
            continue;
          }
        }
        yield flag;
      }
    }
  }
}
