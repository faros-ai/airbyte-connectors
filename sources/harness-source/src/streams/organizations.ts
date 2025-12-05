import {StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Harness} from '../harness';
import {Organization} from '../harness_models';
import {HarnessStreamBase} from './common';

export class Organizations extends HarnessStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/organizations.json');
  }

  get primaryKey(): StreamKey {
    return 'identifier';
  }

  async *readRecords(): AsyncGenerator<Organization> {
    const harness = Harness.instance(this.config, this.logger);
    yield* await harness.getOrganizations();
  }
}
