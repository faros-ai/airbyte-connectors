import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {LinearClient} from '../client/LinearClient';
import {IssueLabel as IssueLabelModel} from '../client/types';
export class IssueLabel extends AirbyteStreamBase {
  public constructor(
    protected readonly logger: AirbyteLogger,
    private readonly client: LinearClient
  ) {
    super(logger);
  }

  public getJsonSchema(): Dictionary<unknown> {
    return require('../../resources/schemas/issueLabel.json');
  }
  public get primaryKey(): StreamKey {
    return ['id'];
  }
  public get cursorField(): string | string[] {
    return [];
  }

  public async *readRecords(): AsyncGenerator<IssueLabelModel> {
    const result = await this.client.issueLabels();
    for (const record of result) {
      yield record;
    }
  }
}
