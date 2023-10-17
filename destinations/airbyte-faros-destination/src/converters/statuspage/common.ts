import {AirbyteRecord} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Common, ComputeApplication} from '../common/common';
import {
  Converter,
  parseObjectConfig,
  StreamContext,
  StreamName,
} from '../converter';

type ApplicationMapping = Record<string, {name: string; platform?: string}>;

interface StatuspageConfig {
  application_mapping?: ApplicationMapping;
}

export interface Component {
  created_at: string;
  description: string | null;
  group: boolean;
  group_id: string | null;
  id: string;
  name: string;
  only_show_if_degraded: boolean;
  page_id: string;
  position: number;
  showcase: boolean;
  start_date: string | null;
  status: string;
  updated_at: string;
}

export enum ComponentStatus {
  degraded_performance = 'degraded_performance',
  major_outage = 'major_outage',
  operational = 'operational',
  partial_outage = 'partial_outage',
  under_maintenance = 'under_maintenance',
}

export interface ComponentUptime {
  id: string;
  name: string;
  range_start: string;
  range_end: string;
  uptime_percentage: number;
  major_outage: number;
  partial_outage: number;
  warnings: ReadonlyArray<string>;
  related_events: ReadonlyArray<{id: string}>;
  page_id: string;
  group_id?: string;
}

export enum IncidentEventTypeCategory {
  Created = 'Created',
  Acknowledged = 'Acknowledged',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export interface IncidentEventType {
  category: IncidentEventTypeCategory;
  detail: string;
}

export enum StatuspageIncidentImpact {
  Critical = 'critical',
  Major = 'major',
  Minor = 'minor',
  None = 'none',
}

export enum StatuspageIncidentStatus {
  Identified = 'identified',
  Investigating = 'investigating',
  Monitoring = 'monitoring',
  Postmortem = 'postmortem',
  Resolved = 'resolved',
}

export enum IncidentStatusCategory {
  Identified = 'Identified',
  Investigating = 'Investigating',
  Monitoring = 'Monitoring',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export interface IncidentPriority {
  category: IncidentPriorityCategory;
  detail: string;
}

export enum IncidentPriorityCategory {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
  Custom = 'Custom',
}

export interface IncidentSeverity {
  category: IncidentSeverityCategory;
  detail: string;
}

export enum IncidentSeverityCategory {
  Sev1 = 'Sev1',
  Sev2 = 'Sev2',
  Sev3 = 'Sev3',
  Sev4 = 'Sev4',
  Sev5 = 'Sev5',
  Custom = 'Custom',
}

export enum ApplicationImpactCategory {
  Operational = 'Operational',
  UnderMaintenance = 'UnderMaintenance',
  DegradedPerformance = 'DegradedPerformance',
  PartialOutage = 'PartialOutage',
  MajorOutage = 'MajorOutage',
  Custom = 'Custom',
}

export interface ApplicationImpact {
  category: ApplicationImpactCategory;
  detail: string;
}

export const ComponentGroupsStream = new StreamName(
  'statuspage',
  'component_groups'
);

export const ComponentsStream = new StreamName('statuspage', 'components');

export const ComponentUptimesStream = new StreamName(
  'statuspage',
  'component_uptimes'
);

export const PagesStream = new StreamName('statuspage', 'pages');

/** Statuspage converter base */
export abstract class StatuspageConverter extends Converter {
  source = 'Statuspage';

  /** Every Statuspage record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected statuspageConfig(ctx: StreamContext): StatuspageConfig {
    return ctx.config.source_specific_configs?.statuspage ?? {};
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return (
      parseObjectConfig(
        this.statuspageConfig(ctx)?.application_mapping,
        'Application Mapping'
      ) ?? {}
    );
  }

  protected computeApplication(
    ctx: StreamContext,
    component: Component
  ): ComputeApplication {
    const mappedApp = this.applicationMapping(ctx)[component.name];
    if (mappedApp) {
      return Common.computeApplication(mappedApp.name, mappedApp.platform);
    }
    const page = ctx.get(PagesStream.asString, component.page_id);
    if (!page) {
      throw new VError('No page record found for id %s', component.page_id);
    }
    let platform = page.record.data.name;
    if (component.group_id) {
      const group = ctx.get(ComponentGroupsStream.asString, component.group_id);
      if (!group) {
        throw new VError(
          'No component group record found for id %s',
          component.group_id
        );
      }
      platform = `${group.record.data.name}/${platform}`;
    }
    return Common.computeApplication(component.name, platform);
  }
}
