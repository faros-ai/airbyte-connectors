import {
    AirbyteLogger,
    AirbyteStreamBase,
    StreamKey,
    SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Team} from '../opsgenie/models';
import {OpsGenie, OpsGenieConfig} from '../opsgenie/opsgenie';
export class Teams extends AirbyteStreamBase {
    constructor(
        private readonly config: OpsGenieConfig,
        protected readonly logger: AirbyteLogger
    ) {
        super(logger);
    }

    getJsonSchema(): Dictionary<any, string> {
        return require('../../resources/schemas/teams.json');
    }
    get primaryKey(): StreamKey {
        return 'id';
    }

    async *readRecords(
        syncMode: SyncMode,
        cursorField?: string[],
        streamSlice?: Dictionary<any>,
        streamState?: Dictionary<any>
    ): AsyncGenerator<Team> {
        const buildkite = OpsGenie.instance(this.config, this.logger);
        yield* buildkite.getTeams();
    }
}
