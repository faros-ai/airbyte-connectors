import {SyncMode} from 'faros-airbyte-cdk';

import {Project} from '../types';
import {HarnessNextgenStreamBase} from './common';

interface OrgSlice {
  orgIdentifier: string;
}

export class Projects extends HarnessNextgenStreamBase {
  getJsonSchema(): Record<string, any> {
    return require('../../resources/schemas/projects.json');
  }

  get primaryKey(): string[] {
    return ['orgIdentifier', 'identifier'];
  }

  async *streamSlices(): AsyncGenerator<OrgSlice> {
    const harness = this.harness;
    for await (const org of harness.getOrganizations(
      this.config.organization_ids
    )) {
      yield {orgIdentifier: org.identifier};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgSlice
  ): AsyncGenerator<Project> {
    const harness = this.harness;
    yield* harness.getProjects(
      streamSlice.orgIdentifier,
      this.config.project_ids
    );
  }
}
