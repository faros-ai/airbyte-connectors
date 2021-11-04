import {Converter, StreamContext} from '../converter';

const DEFAULT_APPLICATION_FIELD = 'service';

type applicationMapping = Record<string, {name: string; platform?: string}>;

interface VictoropsConfig {
  readonly application_mapping?: applicationMapping;
  readonly application_field?: string;
}

export abstract class VictoropsConverter extends Converter {
  protected jiraConfig(ctx: StreamContext): VictoropsConfig {
    return ctx.config.source_specific_configs?.victorops ?? {};
  }

  protected applicationMapping(ctx: StreamContext): applicationMapping {
    return this.jiraConfig(ctx).application_mapping ?? {};
  }
  protected applicationField(ctx: StreamContext): string {
    return this.jiraConfig(ctx).application_field ?? DEFAULT_APPLICATION_FIELD;
  }
}
