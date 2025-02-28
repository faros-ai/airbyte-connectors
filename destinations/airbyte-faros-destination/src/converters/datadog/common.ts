import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Common, ComputeApplication} from '../common/common';
import {
  Converter,
  DestinationRecord,
  parseObjectConfig,
  StreamContext,
} from '../converter';

export enum IncidentSeverityCategory {
  Sev1 = 'Sev1',
  Sev2 = 'Sev2',
  Sev3 = 'Sev3',
  Sev4 = 'Sev4',
  Sev5 = 'Sev5',
  Custom = 'Custom',
}

interface DatadogConfig {
  application_mapping?: ApplicationMapping;
  default_severity?: IncidentSeverityCategory;
}

type ApplicationMapping = Record<string, {name: string; platform?: string}>;

/** Datadog converter base */
export abstract class DatadogConverter extends Converter {
  source = 'Datadog';

  protected readonly seenApplications = new Map<string, ComputeApplication>();
  protected readonly seenTags = new Set<string>();

  /** Almost every Datadog record has an id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return (
      parseObjectConfig(
        this.config(ctx)?.application_mapping,
        'Application Mapping'
      ) ?? {}
    );
  }

  protected config(ctx: StreamContext): DatadogConfig {
    return ctx.config.source_specific_configs?.datadog ?? {};
  }

  protected getApplications(
    ctx: StreamContext,
    services?: string[]
  ): ReadonlyArray<ComputeApplication> {
    const applicationMapping = this.applicationMapping(ctx);
    const applications: ComputeApplication[] = [];
    for (const service of services?.filter(Boolean) ?? []) {
      const mappedApp = applicationMapping[service];
      const application = Common.computeApplication(
        mappedApp?.name ?? service,
        mappedApp?.platform
      );

      const appKey = application.uid;
      if (!this.seenApplications.has(appKey)) {
        this.seenApplications.set(appKey, application);
      }
      applications.push(application);
    }
    return applications;
  }

  protected getTags(tags?: string[]): ReadonlyArray<string> {
    const allTags = tags?.filter(Boolean) ?? [];
    allTags.forEach((tag) => this.seenTags.add(tag));
    return allTags;
  }

  private processApplications(): DestinationRecord[] {
    return Array.from(this.seenApplications.values()).map((application) => ({
      model: 'compute_Application',
      record: application,
    }));
  }

  private processTags(): DestinationRecord[] {
    const records: DestinationRecord[] = [];
    for (const tag of this.seenTags.values()) {
      // Tags are in the format of key:value or key
      // For tags with multiple colons, everything after the first colon is considered the value
      const colonIndex = tag.indexOf(':');
      const [key, value] =
        colonIndex === -1
          ? [tag, null]
          : [tag.substring(0, colonIndex), tag.substring(colonIndex + 1)];

      records.push({
        model: 'faros_Tag',
        record: {
          uid: value ? `${key}:${value}` : key,
          key,
          value,
        },
      });
    }
    return records;
  }

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    return [...this.processApplications(), ...this.processTags()];
  }
}
