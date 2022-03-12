import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamContext} from '../converter';
import {
  BuildStatusCategory,
  DeploymentStatusCategory,
  EnvironmentCategory,
} from './models';

const MAX_DESCRIPTION_LENGTH = 1000;

interface BambooConfig {
  // Max length for free-form description text fields such as task description
  max_description_length?: number;
  baseUrl: string;
}

export class BambooCommon {
  static convertBuildStatus(status: string | undefined): {
    category: BuildStatusCategory;
    detail: string;
  } {
    if (!status) {
      return {category: BuildStatusCategory.Custom, detail: 'undefined'};
    }
    const detail = status.toLowerCase();

    switch (detail) {
      case 'failed':
      case 'broken':
        return {category: BuildStatusCategory.Failed, detail};
      case 'successful':
      case 'fixed':
        return {category: BuildStatusCategory.Success, detail};
      case 'incomplete':
      case 'in_progress':
        return {category: BuildStatusCategory.Running, detail};
      case 'unknown':
        return {category: BuildStatusCategory.Unknown, detail};
      case 'pending':
        return {category: BuildStatusCategory.Queued, detail};
      default:
        return {category: BuildStatusCategory.Custom, detail};
    }
  }

  static convertDeploymentStatus(status: string | undefined): {
    category: DeploymentStatusCategory;
    detail: string;
  } {
    if (!status) {
      return {category: DeploymentStatusCategory.Custom, detail: 'undefined'};
    }
    const detail = status.toLowerCase();

    switch (detail) {
      case 'success':
        return {category: DeploymentStatusCategory.Success, detail};
      case 'failed':
        return {category: DeploymentStatusCategory.Failed, detail};
      case 'pending':
        return {category: DeploymentStatusCategory.Queued, detail};
      case 'in_progress':
        return {category: DeploymentStatusCategory.Running, detail};
      case 'cancelled':
        return {category: DeploymentStatusCategory.Canceled, detail};
      case 'rolled_back':
        return {category: DeploymentStatusCategory.RolledBack, detail};
      default:
        return {category: DeploymentStatusCategory.Custom, detail};
    }
  }

  static convertEnvironmentStatus(status: string | undefined): {
    category: EnvironmentCategory;
    detail: string;
  } {
    if (!status) {
      return {category: EnvironmentCategory.Custom, detail: 'undefined'};
    }
    const detail = status.toLowerCase();

    switch (detail) {
      case 'sandbox':
        return {category: EnvironmentCategory.Sandbox, detail};
      case 'development':
      case 'dev':
        return {category: EnvironmentCategory.Dev, detail};
      case 'testing':
      case 'qa':
        return {category: EnvironmentCategory.QA, detail};
      case 'staging':
        return {category: EnvironmentCategory.Staging, detail};
      case 'production':
      case 'prod':
        return {category: EnvironmentCategory.Prod, detail};
      case 'unmapped':
      default:
        return {category: EnvironmentCategory.Custom, detail};
    }
  }
}

/** Bamboo converter base */
export abstract class BambooConverter extends Converter {
  /** Almost every Bamboo record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected bambooConfig(ctx: StreamContext): BambooConfig {
    return ctx.config.source_specific_configs?.bamboo ?? {};
  }

  protected maxDescriptionLength(ctx: StreamContext): number {
    return (
      this.bambooConfig(ctx).max_description_length ?? MAX_DESCRIPTION_LENGTH
    );
  }

  protected baseUrl(ctx: StreamContext): string | undefined {
    return this.bambooConfig(ctx).baseUrl;
  }
}
