import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamContext} from '../converter';

interface OctopusConfig {
  vcs_source?: string;
}

/** Octopus converter base */
export abstract class OctopusConverter extends Converter {
  source = 'Octopus';
  /** Almost every Octopus record have Id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.Id;
  }

  protected octopusConfig(ctx: StreamContext): OctopusConfig {
    return ctx.config.source_specific_configs?.octopus ?? {};
  }

  protected vcsSource(ctx: StreamContext): string | undefined {
    return this.octopusConfig(ctx)?.vcs_source;
  }
}
