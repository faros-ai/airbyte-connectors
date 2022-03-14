import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, parseObjectConfig, StreamContext} from '../converter';

export interface PagerdutyObject {
  readonly id: string;
  readonly type: string; // object type of the form <name>_reference
  readonly summary: string; // human readable summary
  readonly self: string; // API discrete resource url
  readonly html_url: string; // PagerDuty web url
}

export enum IncidentSeverityCategory {
  Sev1 = 'Sev1',
  Sev2 = 'Sev2',
  Sev3 = 'Sev3',
  Sev4 = 'Sev4',
  Sev5 = 'Sev5',
  Custom = 'Custom',
}

type ApplicationMapping = Record<string, {name: string; platform?: string}>;

interface PagerDutyConfig {
  application_mapping?: ApplicationMapping;
  default_severity?: IncidentSeverityCategory;
}

/** PagerDuty converter base */
export abstract class PagerDutyConverter extends Converter {
  source = 'PagerDuty';

  /** Almost every Pagerduty record have id property. Function will be
   * override if record doesn't have id property.
   */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected pagerdutyConfig(ctx: StreamContext): PagerDutyConfig {
    return ctx.config.source_specific_configs?.pagerduty ?? {};
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return (
      parseObjectConfig(
        this.pagerdutyConfig(ctx)?.application_mapping,
        'Application Mapping'
      ) ?? {}
    );
  }

  protected defaultSeverity(
    ctx: StreamContext
  ): IncidentSeverityCategory | null {
    return this.pagerdutyConfig(ctx).default_severity ?? null;
  }
}
