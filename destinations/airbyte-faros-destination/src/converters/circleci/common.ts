import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {Converter} from '../converter';
import {BuildKey, Pipeline, Workflow} from './models';

export class CircleCICommon {
  static getBuildKey(workflow: Workflow, pipeline: Pipeline, source): BuildKey {
    return {
      uid: `${toLower(pipeline.id)}_${toLower(workflow.id)}`,
      pipeline: {
        uid: this.getProject(pipeline.project_slug),
        organization: {
          uid: this.getOrganization(pipeline.project_slug),
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
}
