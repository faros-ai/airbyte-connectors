import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {Converter, StreamContext} from '../converter';
import {CategoryRef, RepoSource} from './models';

const MAX_DESCRIPTION_LENGTH = 1000;
const TRAVISCI_URL = 'https://travis-ci.com';

interface TravisCIConfig {
  max_description_length?: number;
  travisci_url?: string;
}

export class TravisCICommon {
  static convertVCSOwnerType(type?: string): CategoryRef {
    const detail = toLower(type);
    switch (detail) {
      case 'organization':
        return {category: 'Organization', detail};
      case 'user':
      default:
        return {category: 'Custom', detail};
    }
  }

  static parseVCSType(type: string): string {
    const vcsType = toLower(type);
    if (vcsType?.includes('bitbucket')) return RepoSource.BITBUCKET;
    else if (vcsType?.includes('gitlab')) return RepoSource.GITLAB;
    else if (vcsType?.includes('github')) return RepoSource.GITHUB;
    return RepoSource.VCS;
  }
  static convertBuildState(status?: string): CategoryRef {
    if (!status) {
      return {category: 'Unknown', detail: 'undefined'};
    }

    const detail = toLower(status);
    switch (detail) {
      case 'started':
        return {category: 'Running', detail};
      case 'created':
      case 'queued':
      case 'ready':
      case 'received':
        return {category: 'Queued', detail};
      case 'passed':
        return {category: 'Success', detail};
      case 'failed':
      case 'errored':
        return {category: 'Failed', detail};
      case 'canceled':
        return {category: 'Canceled', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
/** TravisCI converter base */
export abstract class TravisCIConverter extends Converter {
  source = 'TravisCI';

  /** Almost every TravisCI record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected travisciConfig(ctx: StreamContext): TravisCIConfig {
    return ctx.config.source_specific_configs?.travisci ?? {};
  }

  protected maxDescriptionLength(ctx: StreamContext): number {
    return (
      this.travisciConfig(ctx).max_description_length ?? MAX_DESCRIPTION_LENGTH
    );
  }

  protected travisciUrl(ctx: StreamContext): string {
    return this.travisciConfig(ctx).travisci_url ?? TRAVISCI_URL;
  }
}
