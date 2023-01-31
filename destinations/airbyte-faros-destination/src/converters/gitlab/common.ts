import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Converter, DestinationRecord} from '../converter';

export interface CategoryRef {
  readonly category: string;
  readonly detail: string;
}

interface OrgKey {
  uid: string;
  source: string;
}

interface RepositoryKey {
  name: string;
  uid: string;
  organization: OrgKey;
}

interface BuildKey {
  uid: string;
  pipeline: Omit<RepositoryKey, 'name'>;
}

/** Common functions shares across GitLab converters */
export class GitlabCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  static tms_ProjectBoard_with_TaskBoard(
    projectKey: ProjectKey,
    name: string,
    description: string | null,
    createdAt: string | null | undefined,
    updatedAt: string | null | undefined
  ): DestinationRecord[] {
    return [
      {
        model: 'tms_Project',
        record: {
          ...projectKey,
          name: name,
          description: description?.substring(
            0,
            GitlabCommon.MAX_DESCRIPTION_LENGTH
          ),
          createdAt: Utils.toDate(createdAt),
          updatedAt: Utils.toDate(updatedAt),
        },
      },
      {
        model: 'tms_TaskBoard',
        record: {
          ...projectKey,
          name,
        },
      },
      {
        model: 'tms_TaskBoardProjectRelationship',
        record: {
          board: projectKey,
          project: projectKey,
        },
      },
    ];
  }

  static parseRepositoryKey(
    webUrl: string | undefined,
    source: string,    
  ): undefined | RepositoryKey {
    if (!webUrl) {
      return undefined;
    }
    return this.parseKeyFromUrl(webUrl, source, false);
  }

  static parseGroupKey(
    webUrl: string | undefined,
    source: string,    
  ): undefined | OrgKey {
    if (!webUrl) {
      return undefined;
    }
    return this.parseKeyFromUrl(webUrl, source, true);
  }

  private static parseKeyFromUrl<B extends boolean>(
    webUrl: string,
    source: string,
    hasGroupPrefix: B
  ): B extends true ? OrgKey : RepositoryKey;

  private static parseKeyFromUrl(
    webUrl: string,
    source: string,
    hasGroupPrefix: boolean
  ): OrgKey | RepositoryKey {
    const startIndex = hasGroupPrefix ? 4 : 3;
    const nameParts: ReadonlyArray<string> = webUrl.split('/');
    const endIndex = nameParts.indexOf('-') == -1 ? nameParts.length : nameParts.indexOf('-');
    const uid = nameParts.slice(startIndex, endIndex).join('/').toLowerCase();
    
    if (hasGroupPrefix) {
      return { uid: uid, source };
    }
    
    const org = nameParts[startIndex].toLowerCase();
    const name = nameParts[endIndex - 1].toLowerCase();

    return {
      organization: { uid: org, source },
      uid,
      name,
    };
  }

  static createBuildKey(pipelineId: any, repository: RepositoryKey): BuildKey {
    return {
      uid: String(pipelineId),
      pipeline: {
        organization: repository.organization,
        uid: repository.uid,
      },
    };
  }

  // GitLab defined status for:
  // >> pipelines (aka builds): created, waiting_for_resource, preparing, pending,
  //    running, success, failed, canceled, skipped, manual, scheduled
  // >> jobs: created, pending, running, failed, success, canceled, skipped, or manual.
  static convertBuildStatus(status?: string): CategoryRef {
    if (!status) {
      return {category: 'Unknown', detail: 'undefined'};
    }
    const detail = status?.toLowerCase();
    switch (detail) {
      case 'canceled':
        return {category: 'Canceled', detail};
      case 'failed':
        return {category: 'Failed', detail};
      case 'running':
        return {category: 'Running', detail};
      case 'success':
        return {category: 'Success', detail};
      case 'created':
      case 'manual':
      case 'pending':
      case 'preparing':
      case 'scheduled':
      case 'waiting_for_resource':
        return {category: 'Queued', detail};
      case 'skipped':
      default:
        return {category: 'Custom', detail};
    }
  }
}

/** GitLab converter base */
export abstract class GitlabConverter extends Converter {
  source = 'GitLab';

  /** Almost every GitLab record have id property. Function will be
   * override if record doesn't have id property.
   */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}

export interface ProjectKey {
  uid: string;
  source: string;
}
