import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {LinearClient} from '../client/LinearClient';
import {Organization as OrganizationModel} from '../client/types';
export class Organization extends AirbyteStreamBase {
  public constructor(
    protected readonly logger: AirbyteLogger,
    private readonly client: LinearClient
  ) {
    super(logger);
  }

  public getJsonSchema(): Dictionary<unknown> {
    return require('../../resources/schemas/organization.json');
  }
  public get primaryKey(): StreamKey {
    return ['id'];
  }

  public get cursorField(): string | string[] {
    return [];
  }

  public async *readRecords(): AsyncGenerator<OrganizationModel> {
    const result = await this.client.organizations();
    for (const record of result) {
      yield record;
    }
  }
}
