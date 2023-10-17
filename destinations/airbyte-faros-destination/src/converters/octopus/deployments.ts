import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import GitUrlParse from 'git-url-parse';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OctopusConverter} from './common';

interface ArtifactVCSInfo {
  artifactUid: string;
  sha?: string;
  repository: {
    name: string;
    organization: {
      uid: string;
      source: string;
    };
  };
}

export class Deployments extends OctopusConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Deployment',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const deployment = record.record.data;

    const deploymentKey = {
      uid: deployment.Id,
      source,
    };

    res.push({
      model: 'cicd_Deployment',
      record: {
        ...deploymentKey,
        application: Common.computeApplication(deployment.ProjectName),
        url: deployment.Links?.Self,
        requestedAt: Utils.toDate(deployment.Task?.QueueTime),
        startedAt: Utils.toDate(deployment.Task?.StartTime),
        endedAt: Utils.toDate(deployment.Task?.CompletedTime),
        env: this.convertOctopusEnvironment(deployment.EnvironmentName),
        status: this.convertOctopusStatus(
          deployment.Task?.State,
          deployment.Task?.ErrorMessage
        ),
      },
    });

    const vcsInfo = this.getVCSInfo(deployment, ctx);

    for (const vcs of vcsInfo) {
      const artifactKey = {
        uid: vcs.artifactUid,
        repository: {
          uid: vcs.repository.name,
          organization: vcs.repository.organization,
        },
      };

      res.push({
        model: 'cicd_ArtifactDeployment',
        record: {
          artifact: artifactKey,
          deployment: deploymentKey,
        },
      });

      if (vcs.sha) {
        // Only instantiate artifact if we can link all the way to commit
        res.push({
          model: 'cicd_Artifact',
          record: artifactKey,
        });
        res.push({
          model: 'cicd_ArtifactCommitAssociation',
          record: {
            artifact: artifactKey,
            commit: {
              sha: vcs.sha,
              repository: vcs.repository,
            },
          },
        });
      }
    }

    return res;
  }

  private getVCSInfo(deployment: any, ctx: StreamContext): ArtifactVCSInfo[] {
    const deployId = deployment.Id;
    const logger = ctx.logger;

    let commitSha: string;
    let repoName: string;
    let orgUid: string;
    let orgSource: string = this.vcsSource(ctx);

    // Attempt to first retrieve VCS information from explicit deployment variables
    for (const v of deployment.Variables ?? []) {
      if (v.Name === 'VCS_COMMIT') {
        commitSha = this.getVarValue(deployId, v, logger);
      } else if (v.name === 'VCS_REPO') {
        repoName = this.getVarValue(deployId, v, logger);
      } else if (v.name === 'VCS_ORG') {
        orgUid = this.getVarValue(deployId, v, logger);
      } else if (v.name === 'VCS_SOURCE') {
        orgSource = this.getVarValue(deployId, v, logger);
      }
    }

    // If all information provided as variables return it
    if (commitSha && repoName && orgUid) {
      return [
        {
          artifactUid: commitSha,
          sha: commitSha,
          repository: {
            name: repoName,
            organization: {
              uid: orgUid,
              source: orgSource,
            },
          },
        },
      ];
    }

    const vcsInfo: ArtifactVCSInfo[] = [];
    const hasChangeArray =
      deployment.Changes &&
      Array.isArray(deployment.Changes) &&
      deployment.Changes.length > 0;

    if (hasChangeArray) {
      // First try to construct the fallback repo from explicit deployment variables
      let fallbackRepoInfo: ArtifactVCSInfo['repository'];
      if (repoName && orgUid) {
        fallbackRepoInfo = {
          name: repoName,
          organization: {
            uid: orgUid,
            source: orgSource,
          },
        };
      }

      // If fallback not set attempt to retrieve it from repo property in process
      if (!fallbackRepoInfo) {
        for (const step of deployment.Process?.Steps ?? []) {
          for (const action of step.Actions ?? []) {
            const repo = action.Properties?.['repo'];
            if (repo) {
              fallbackRepoInfo = this.getRepoInfoFromURL(deployId, repo, ctx);
              break;
            }
          }
          if (fallbackRepoInfo) {
            break;
          }
        }
      }

      // Assume last change was the one deployed
      const change = deployment.Changes.at(-1);

      // Retrieve repo information from Commits
      for (const commit of change.Commits ?? []) {
        const artifactUid = change.Version;
        const sha = commit.Id;
        const repository =
          this.getRepoInfoFromURL(deployId, commit.LinkUrl, ctx) ??
          fallbackRepoInfo;

        if (repository) {
          vcsInfo.push({artifactUid, sha, repository});
        }
      }

      // Commits did not yield any VCS info, use BuildInformation
      if (!vcsInfo.length) {
        for (const buildInfo of change.BuildInformation ?? []) {
          const artifactUid = `${buildInfo.PackageId}:${buildInfo.Version}`;
          const sha = buildInfo.VcsCommitNumber;
          const repository =
            this.getRepoInfoFromURL(deployId, buildInfo.VcsRoot, ctx) ??
            fallbackRepoInfo;

          if (repository) {
            vcsInfo.push({artifactUid, sha, repository});
          }
        }
      }

      // If still no info create a dummy artifact using Change.Version
      if (!vcsInfo.length && fallbackRepoInfo) {
        vcsInfo.push({
          artifactUid: change.Version,
          repository: fallbackRepoInfo,
        });
      }
    }

    if (!vcsInfo.length) {
      logger.warn(`Could not retrieve VCS info for deployment: ${deployId}`);
    }

    return vcsInfo;
  }

  private getRepoInfoFromURL(
    deploymentId: string,
    url: string,
    ctx: StreamContext
  ): ArtifactVCSInfo['repository'] {
    try {
      const parsedUrl = GitUrlParse(url);
      return {
        name: parsedUrl.name.toLowerCase(),
        organization: {
          uid: parsedUrl.owner.toLowerCase(),
          source: this.vcsSource(ctx),
        },
      };
    } catch (err: any) {
      ctx.logger.warn(
        `Unable to parse VCS information for deployment ${deploymentId} from repo url: ${url}`
      );
    }
  }

  private getVarValue(
    deploymentId: string,
    variable: {Name: string; Value: string},
    logger: AirbyteLogger
  ): string | undefined {
    if (variable.Value) {
      return variable.Value;
    }
    logger.warn(
      `Deployment [${deploymentId}] had a null value for ${variable.Name} variable`
    );
    return undefined;
  }

  /**
   * Octopus task statuses include:
   * Canceled, Cancelling, Executing, Failed, Queued, Success, TimedOut
   */
  private convertOctopusStatus(
    octopusStatus: string | undefined,
    octopusErrMsg: string | undefined
  ): {
    category: string;
    detail: string;
  } {
    if (!octopusStatus) {
      return {category: 'Custom', detail: 'undefined'};
    }
    const status = octopusStatus.toLowerCase();
    const detail = `${octopusStatus}${
      octopusErrMsg ? ' - ' + octopusErrMsg : ''
    }`;

    switch (status) {
      case 'canceled':
      case 'cancelling':
        return {category: 'Canceled', detail};
      case 'executing':
        return {category: 'Running', detail};
      case 'failed':
        return {category: 'Failed', detail};
      case 'success':
        return {category: 'Success', detail};
      case 'queued':
        return {category: 'Queued', detail};
      default:
        return {category: 'Custom', detail};
    }
  }

  private convertOctopusEnvironment(octopusEnv: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!octopusEnv) {
      return {category: 'Custom', detail: 'undefined'};
    }
    const env = octopusEnv.toLowerCase();
    const detail = octopusEnv;

    switch (env) {
      case 'production':
      case 'prod':
        return {category: 'Prod', detail};
      case 'staging':
        return {category: 'Staging', detail};
      case 'qa':
        return {category: 'QA', detail};
      case 'development':
      case 'develop':
      case 'dev':
        return {category: 'Dev', detail};
      case 'sandbox':
        return {category: 'Sandbox', detail};
      case 'canary':
        return {category: 'Canary', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
