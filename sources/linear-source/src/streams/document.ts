import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {LinearClient} from '../client/LinearClient';
import {Document as Model} from '../client/types';

export class Document extends AirbyteStreamBase {
  public constructor(
    protected readonly logger: AirbyteLogger,
    private readonly client: LinearClient
  ) {
    super(logger);
  }

  public getJsonSchema(): Dictionary<unknown> {
    return require('../../resources/schemas/document.json');
  }
  public get primaryKey(): StreamKey {
    return ['id'];
  }
  public get cursorField(): string | string[] {
    return [];
  }

  public async *readRecords(): AsyncGenerator<Model> {
    const result = await this.client.documents();
    for (const record of result) {
      yield record;
    }
  }
}
