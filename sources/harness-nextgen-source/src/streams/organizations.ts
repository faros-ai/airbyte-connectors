import {Organization} from '../types';
import {HarnessNextgenStreamBase} from './common';

export class Organizations extends HarnessNextgenStreamBase {
  getJsonSchema(): Record<string, any> {
    return require('../../resources/schemas/organizations.json');
  }

  get primaryKey(): string {
    return 'identifier';
  }

  async *readRecords(): AsyncGenerator<Organization> {
    const harness = this.harness;
    yield* harness.getOrganizations(this.config.organization_ids);
  }
}
