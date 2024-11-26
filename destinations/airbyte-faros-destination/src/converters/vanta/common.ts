import {AirbyteRecord} from 'faros-airbyte-cdk';
import {VulnerableAsset} from 'faros-airbyte-common/lib/vanta';

import {Converter} from '../converter';
import {looksLikeGitCommitSha} from './utils';

export abstract class VantaConverter extends Converter {
  source = 'Vanta';

  /** All Vanta records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected isVCSRepoVulnerability(vulnerableAsset: VulnerableAsset): boolean {
    return vulnerableAsset.type === 'CODE_REPOSITORY';
  }

  protected isCICDArtifactVulnerability(
    vulnerableAsset: VulnerableAsset
  ): boolean {
    return this.getCommitSha(vulnerableAsset.imageTags)?.length > 0;
  }

  protected getCommitSha(imageTags?: string[]): string | null {
    if (!imageTags) {
      return null;
    }
    for (const imageTag of imageTags) {
      if (looksLikeGitCommitSha(imageTag)) {
        return imageTag;
      }
    }
    return null;
  }
}
