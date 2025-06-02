import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Vcs} from 'faros-airbyte-common/circleci';
import {toLower} from 'lodash';

import {Converter, StreamContext} from '../converter';
import {BuildKey, CommitKey} from './models';

export interface CircleCIConfig {
  skip_writing_test_cases: boolean;
}

export class CircleCICommon {
  static getCommitKey(vcs: Vcs, project_slug: string): CommitKey {
    const repoName = CircleCICommon.getProject(project_slug);
    return {
      sha: vcs.revision,
      uid: vcs.revision,
      repository: {
        name: repoName,
        uid: repoName,
        organization: {
          uid: CircleCICommon.getOrganization(project_slug),
          source: vcs.provider_name,
        },
      },
    };
  }

  static getBuildKey(
    workflow_id: string,
    pipeline_id: string,
    project_slug: string,
    source: string
  ): BuildKey {
    return {
      uid: `${toLower(pipeline_id)}__${toLower(workflow_id)}`,
      pipeline: {
        uid: this.getProject(project_slug),
        organization: {
          uid: this.getOrganization(project_slug),
          source,
        },
      },
    };
  }
  static getOrganization(projectSlug: string): string {
    return toLower(projectSlug.split('/')[1]);
  }
  static getProject(projectSlug: string): string {
    return toLower(projectSlug.split('/')[2]);
  }
  static convertStatus(status: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!status) {
      return {category: 'Unknown', detail: 'undefined'};
    }
    const detail = toLower(status);

    // Read more on CircleCI workflow states
    // https://circleci.com/docs/2.0/workflows/?section=pipelines#states
    switch (detail) {
      case 'canceling':
      case 'canceled':
      case 'cancelled':
        return {category: 'Canceled', detail};
      case 'error':
      case 'failing':
      case 'failed':
        return {category: 'Failed', detail};
      case 'success':
        return {category: 'Success', detail};
      case 'running':
        return {category: 'Running', detail};
      case 'on hold':
      case 'needs setup':
        return {category: 'Queued', detail};
      default:
        return {category: 'Custom', detail};
    }
  }

  static convertJobType(type: string): {category: string; detail: string} {
    switch (toLower(type)) {
      case 'manual':
        return {category: 'Manual', detail: type};
      case 'script':
        return {category: 'Script', detail: type};
      default:
        return {category: 'Custom', detail: type};
    }
  }
}

/** CircleCI converter base */
export abstract class CircleCIConverter extends Converter {
  source = 'CircleCI';

  /** Almost every CircleCI record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected circleCIConfig(ctx: StreamContext): CircleCIConfig {
    return ctx.config.source_specific_configs?.circleci ?? {};
  }
}
