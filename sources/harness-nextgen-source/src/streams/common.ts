import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {HarnessNextgen} from '../harness-nextgen';
import {HarnessNextgenConfig} from '../types';

export abstract class HarnessNextgenStreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: HarnessNextgenConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  protected get harness(): HarnessNextgen {
    return HarnessNextgen.instance(this.config, this.logger);
  }
}

export interface ProjectSlice {
  orgIdentifier: string;
  projectIdentifier: string;
}

export abstract class StreamWithProjectSlices extends HarnessNextgenStreamBase {
  async *streamSlices(): AsyncGenerator<ProjectSlice> {
    const harness = this.harness;

    for await (const org of harness.getOrganizations(
      this.config.organization_ids
    )) {
      for await (const project of harness.getProjects(
        org.identifier,
        this.config.project_ids
      )) {
        yield {
          orgIdentifier: org.identifier,
          projectIdentifier: project.identifier,
        };
      }
    }
  }
}
