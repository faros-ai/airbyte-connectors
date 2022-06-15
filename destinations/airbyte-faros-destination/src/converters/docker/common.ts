import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamContext} from '../converter';

export const ARTIFACT_TYPE = 'Docker';
const DEFAULT_LABEL_PREFIX = 'faros-';

interface DockerConfig {
  label_prefix?: string;
  skip_tags?: string[];
  organization?: string;
}

interface LayerConfig {
  mediaType: string;
  size: number;
  digest: string;
}

interface ImageManifest {
  schemaVersion: number;
  mediaType: string;
  config: LayerConfig;
  layers: LayerConfig[];
  /**
   * Optional for backwards compatibility. This field is not directly returned by the container registry,
   * it is appended before returning the ImageManifest.
   * It is only applicable to multi-platform images.
   */
  indexDigest?: string;
  /**
   * Optional for backwards compatibility. This field is not directly returned by the container registry,
   * it is appended before returning the ImageManifest.
   */
  manifestDigest?: string;
}

interface ImageConfigContainer {
  Labels: Record<string, string>;
}

interface ImageConfig {
  config: ImageConfigContainer;
  created: string;
}

export interface Tag {
  name: string;
  projectName: string;
  imageConfig?: ImageConfig;
  imageManifest?: ImageManifest;
}

export interface OrganizationKey {
  readonly uid: string;
  readonly source: string;
}

interface PipelineKey {
  readonly uid: string;
  readonly organization: OrganizationKey;
}

interface BuildKey {
  readonly uid: string;
  readonly pipeline: PipelineKey;
}

export interface RepositoryKey {
  readonly uid: string;
  readonly organization: OrganizationKey;
}

interface VCSRepositoryKey {
  readonly name: string;
  readonly organization: OrganizationKey;
}

interface CommitKey {
  readonly sha: string;
  readonly uid: string;
  readonly repository: VCSRepositoryKey;
}

export interface CICDTag {
  name: string;
  value: string;
}

export class DockerCommon {
  static ALLOWED_MANIFEST_SCHEMA_VERSION = 2;

  static getBuildKey(tags: CICDTag[], prefix: string): BuildKey | undefined {
    const buildId = tags.find(({name}) => name === `${prefix}build-id`);
    const ciPipeline =
      tags.find(({name}) => name === `${prefix}ci-pipeline`) ??
      tags.find(({name}) => name === `${prefix}pipeline-id`);
    const ciOrg =
      tags.find(({name}) => name === `${prefix}ci-org`) ??
      tags.find(({name}) => name === `${prefix}org-id`);
    const ciSource =
      tags.find(({name}) => name === `${prefix}ci-source`) ??
      tags.find(({name}) => name === `${prefix}org-source`);
    if (buildId && ciPipeline && ciOrg && ciSource) {
      return {
        uid: buildId.value,
        pipeline: {
          uid: ciPipeline.value,
          organization: {
            uid: ciOrg.value,
            source: ciSource.value,
          },
        },
      };
    }
    return undefined;
  }

  static getCommitKey(tags: CICDTag[], prefix: string): CommitKey | undefined {
    const commitSha = tags.find(({name}) => name === `${prefix}commit-sha`);
    const vcsRepo = tags.find(({name}) => name === `${prefix}vcs-repo`);
    const vcsOrg = tags.find(({name}) => name === `${prefix}vcs-org`);
    const vcsSource = tags.find(({name}) => name === `${prefix}vcs-source`);
    if (commitSha && vcsRepo && vcsOrg && vcsSource) {
      return {
        sha: commitSha.value,
        uid: commitSha.value,
        repository: {
          name: vcsRepo.value,
          organization: {
            uid: vcsOrg.value,
            source: vcsSource.value,
          },
        },
      };
    }
    return undefined;
  }
}

/** Docker converter base */
export abstract class DockerConverter extends Converter {
  source = 'Docker';

  /** Every Docker record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected dockerConfig(ctx: StreamContext): DockerConfig {
    return ctx.config.source_specific_configs?.docker ?? {};
  }

  protected labelPrefix(ctx: StreamContext): string {
    return this.dockerConfig(ctx).label_prefix || DEFAULT_LABEL_PREFIX;
  }
  protected skipTags(ctx: StreamContext): string[] {
    return this.dockerConfig(ctx).skip_tags ?? [];
  }
  protected organization(ctx: StreamContext): string | undefined {
    return this.dockerConfig(ctx).organization;
  }
}
