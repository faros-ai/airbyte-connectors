import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Workspace} from 'faros-airbyte-common/clickup';
import {Dictionary} from 'ts-essentials';

import {ClickUpConfig} from '..';
import {ClickUp} from '../clickup';

export class Workspaces extends AirbyteStreamBase {
  constructor(
    private readonly cfg: ClickUpConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workspaces.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<Workspace> {
    const clickup = ClickUp.make(this.cfg, this.logger);
    for (const workspace of await clickup.workspaces()) {
      yield workspace;
    }
  }
}
