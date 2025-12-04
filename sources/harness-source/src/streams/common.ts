import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {Harness} from '../harness';
import {HarnessConfig} from '../harness_models';

// Stream slice types
export interface OrgStreamSlice {
  orgIdentifier: string;
}

export interface ProjectStreamSlice {
  orgIdentifier: string;
  projectIdentifier: string;
}

export interface PipelineStreamSlice {
  orgIdentifier: string;
  projectIdentifier: string;
  pipelineIdentifier: string;
}

// Base class for Harness streams
export abstract class HarnessStreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: HarnessConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  protected async getOrgIdentifiers(harness: Harness): Promise<string[]> {
    if (this.config.organizations?.length) {
      return this.config.organizations;
    }
    const orgs = await harness.getOrganizations();
    return orgs.map((org) => org.identifier);
  }
}

// Base class for streams that slice by organization
export abstract class StreamWithOrgSlices extends HarnessStreamBase {
  async *streamSlices(): AsyncGenerator<OrgStreamSlice> {
    const harness = Harness.instance(this.config, this.logger);

    for (const orgIdentifier of await this.getOrgIdentifiers(harness)) {
      yield {orgIdentifier};
    }
  }
}

// Base class for streams that slice by project
export abstract class StreamWithProjectSlices extends HarnessStreamBase {
  async *streamSlices(): AsyncGenerator<ProjectStreamSlice> {
    const harness = Harness.instance(this.config, this.logger);

    for (const orgIdentifier of await this.getOrgIdentifiers(harness)) {
      const projects = await harness.getProjects(orgIdentifier);
      for (const project of projects) {
        yield {orgIdentifier, projectIdentifier: project.identifier};
      }
    }
  }
}

// Base class for streams that slice by pipeline
export abstract class StreamWithPipelineSlices extends HarnessStreamBase {
  async *streamSlices(): AsyncGenerator<PipelineStreamSlice> {
    const harness = Harness.instance(this.config, this.logger);

    for (const orgIdentifier of await this.getOrgIdentifiers(harness)) {
      const projects = await harness.getProjects(orgIdentifier);
      for (const project of projects) {
        const pipelines = await harness.getPipelines(
          orgIdentifier,
          project.identifier
        );
        for (const pipeline of pipelines) {
          yield {
            orgIdentifier,
            projectIdentifier: project.identifier,
            pipelineIdentifier: pipeline.identifier,
          };
        }
      }
    }
  }
}
