import {AxiosInstance} from 'axios';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteStreamBase,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {genAuthorizationHeader} from '../gen-authorization-header';

export class CampaignActions extends AirbyteStreamBase {
  constructor(
    logger: AirbyteLogger,
    private readonly axios: AxiosInstance,
    private readonly config: AirbyteConfig
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/campaign-actions.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  get cursorField(): string {
    return 'updated';
  }

  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestRecord: Dictionary<any>
  ): Dictionary<any> {
    return {
      cutoff: Math.max(
        currentStreamState.cutoff ?? 0,
        latestRecord.updated ?? 0
      ),
    };
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const lastCutoff: number = streamState?.cutoff ?? 0;
    if (lastCutoff > Date.now() / 1000) {
      this.logger.info(
        `Last cutoff ${lastCutoff} is greater than current time`
      );
      return;
    }

    const campaignsResponse = await this.axios.get('/campaigns', {
      headers: genAuthorizationHeader(this.config),
    });

    for (const campaign of campaignsResponse.data.campaigns) {
      if (Array.isArray(campaign?.actions) && campaign.actions.length > 0) {
        let nextKey: string | undefined;

        do {
          const pageResponse = await this.axios.get(
            `/campaigns/${campaign.id}/actions`,
            {
              headers: genAuthorizationHeader(this.config),
              params: {
                start: nextKey,
              },
            }
          );

          nextKey = pageResponse.data.next || undefined;

          for (const action of pageResponse.data.actions ?? []) {
            if (action.updated >= lastCutoff) {
              yield action;
            }
          }
        } while (nextKey);
      }
    }
  }
}
