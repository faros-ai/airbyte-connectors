import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Converter, DestinationRecord, StreamContext} from '../converter';

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

  static mapRepositoryHierarchy<T>(
    repository: RepositoryKey,
    callback: (k: ProjectKey) => T
  ): T[] {
    return repository.uid.split('/').map((_, i, a) => {
      const key = {
        uid: a.slice(0, i + 1).join('/'),
        source: repository.organization.source,
      };
      return callback(key);
    });
  }

  static tms_TaskBoard(boardKey: ProjectKey, name: string): DestinationRecord {
    return {
      model: 'tms_TaskBoard',
      record: {
        ...boardKey,
        name,
      },
    };
  }

  static tms_TaskBoardProjectRelationship(
    boardKey: ProjectKey,
    projectKey: ProjectKey
  ): DestinationRecord {
    return {
      model: 'tms_TaskBoardProjectRelationship',
      record: {
        board: boardKey,
        project: projectKey,
      },
    };
  }

  static tms_ProjectBoard_with_TaskBoard(
    repository: RepositoryKey,
    description: string | null,
    createdAt: string | null | undefined,
    updatedAt: string | null | undefined
  ): DestinationRecord[] {
    const projectKey = {
      uid: repository.uid,
      source: repository.organization.source,
    };
    const name = repository.name;
    return [
      {
        model: 'tms_Project',
        record: {
          ...projectKey,
          name: name,
          description: Utils.cleanAndTruncate(
            description,
            GitlabCommon.MAX_DESCRIPTION_LENGTH
          ),
          createdAt: Utils.toDate(createdAt),
          updatedAt: Utils.toDate(updatedAt),
        },
      },
      this.tms_TaskBoard(projectKey, name),
      // traverse the hierarchy to link boards for the sub groups and the project itself
      ...this.mapRepositoryHierarchy<DestinationRecord>(repository, (key) =>
        this.tms_TaskBoardProjectRelationship(key, projectKey)
      ),
    ];
  }

  static parseRepositoryKey(
    webUrl: string | undefined,
    source: string
  ): undefined | RepositoryKey {
    if (!webUrl) {
      return undefined;
    }
    return this.parseKeyFromUrl(webUrl, source, false);
  }

  static parseGroupKey(
    webUrl: string | undefined,
    source: string
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
    const endIndex =
      nameParts.indexOf('-') == -1 ? nameParts.length : nameParts.indexOf('-');
    const uid = nameParts
      .slice(startIndex + 1, endIndex)
      .join('/')
      .toLowerCase();

    if (hasGroupPrefix) {
      return {uid: uid, source};
    }

    const org = nameParts[startIndex].toLowerCase();
    const name = nameParts[endIndex - 1].toLowerCase();

    return {
      organization: {uid: org, source},
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

  protected cicdEnabled(ctx: StreamContext): boolean {
    const enabledStreams = ctx.getSourceConfig()?.enabledStreams ?? [];
    return enabledStreams.includes('faros_deployments');
  }

  protected tmsEnabled(ctx: StreamContext): boolean {
    const enabledStreams = ctx.getSourceConfig()?.enabledStreams ?? [];
    return enabledStreams.includes('faros_issues');
  }
}

export interface ProjectKey {
  uid: string;
  source: string;
}
