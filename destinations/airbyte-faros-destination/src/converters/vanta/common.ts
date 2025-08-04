import {AirbyteRecord} from 'faros-airbyte-cdk';
import {VulnerableAssetSummary} from 'faros-airbyte-common/lib/vanta';

import {Converter, StreamContext} from '../converter';
import {looksLikeGitCommitShaOrVersion} from './utils';

export abstract class VantaConverter extends Converter {
  source = 'Vanta';

  /** All Vanta records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected isVCSRepoVulnerability(
    vulnerableAsset: VulnerableAssetSummary
  ): boolean {
    return vulnerableAsset.type === 'CODE_REPOSITORY';
  }

  protected isCICDArtifactVulnerability(
    vulnerableAsset: VulnerableAssetSummary
  ): boolean {
    return this.getCommitSha(vulnerableAsset.imageTags)?.length > 0;
  }

  protected getCommitSha(imageTags?: string[]): string | null {
    for (const imageTag of imageTags ?? []) {
      if (looksLikeGitCommitShaOrVersion(imageTag)) {
        return imageTag;
      }
    }
    return null;
  }

  protected logVulnerabilityWarnings(
    ctx: StreamContext,
    vulnerabilities: Set<string>,
    message: string
  ): void {
    if (vulnerabilities.size > 0) {
      ctx.logger.warn(`${message} - Count: ${vulnerabilities.size}`);
    }
  }
}
