import {Converter, parseObjectConfig, StreamContext} from '../converter';

const DEFAULT_APPLICATION_FIELD = 'service';

type ApplicationMapping = Record<string, {name: string; platform?: string}>;

interface VictoropsConfig {
  readonly application_mapping?: ApplicationMapping;
  readonly application_field?: string;
}

export abstract class VictoropsConverter extends Converter {
  protected victoropsConfig(ctx: StreamContext): VictoropsConfig {
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
