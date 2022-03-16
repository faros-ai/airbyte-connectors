import {Converter, parseObjectConfig, StreamContext} from '../converter';

const DEFAULT_APPLICATION_FIELD = 'service';

type ApplicationMapping = Record<string, {name: string; platform?: string}>;

interface VictorOpsConfig {
  readonly application_mapping?: ApplicationMapping;
  readonly application_field?: string;
}

export abstract class VictorOpsConverter extends Converter {
  source = 'VictorOps';

  protected victoropsConfig(ctx: StreamContext): VictorOpsConfig {
    return ctx.config.source_specific_configs?.victorops ?? {};
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return (
      parseObjectConfig(
        this.victoropsConfig(ctx)?.application_mapping,
        'Application Mapping'
      ) ?? {}
    );
  }
  protected applicationField(ctx: StreamContext): string {
    return (
      this.victoropsConfig(ctx).application_field ?? DEFAULT_APPLICATION_FIELD
    );
  }
}
