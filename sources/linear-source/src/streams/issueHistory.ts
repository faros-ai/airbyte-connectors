import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {LinearClient} from '../client/LinearClient';
import {IssueHistory as IssueHistoryModel} from '../client/types';
export class IssueHistory extends AirbyteStreamBase {
  public constructor(
    protected readonly logger: AirbyteLogger,
    private readonly client: LinearClient
  ) {
    super(logger);
  }

  public getJsonSchema(): Dictionary<unknown> {
    return require('../../resources/schemas/issueHistory.json');
  }
  public get primaryKey(): StreamKey {
    return ['id'];
  }
  public get cursorField(): string | string[] {
    return [];
  }

  public async *readRecords(): AsyncGenerator<IssueHistoryModel> {
    const result = await this.client.issueHistory();
    for (const record of result) {
      yield record;
    }
  }
}
