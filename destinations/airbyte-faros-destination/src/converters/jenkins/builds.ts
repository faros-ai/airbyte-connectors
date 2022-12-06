import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import parseGitUrl from 'git-url-parse';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JenkinsCommon, JenkinsConverter, RepoSource} from './common';

export class Builds extends JenkinsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
    'cicd_Pipeline',
    'cicd_Build',
    'cicd_BuildCommitAssociation',
    'vcs_Commit',
  ];
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
  BUILD_DATA_CLASS = 'hudson.plugins.git.util.BuildData';
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const build = record.record.data;

    const jenkinsUrl = JenkinsCommon.parseJenkinsUrl(build.url);
    if (!jenkinsUrl) return [];
    const organization = JenkinsCommon.cicd_Organization(jenkinsUrl, source);
    const orgKey = {uid: organization.record.uid, source};

    const jobFullName = build.fullDisplayName.replace(/ #.*/, '');
    const job = {
      fullName: jobFullName,
      name: jobFullName,
      url: jenkinsUrl.url.replace(/[^/]*(\/)?$/, ''),
    };
    const pipeline = JenkinsCommon.cicd_Pipeline(job, orgKey);
    const pipelineKey = {uid: job.fullName.toLowerCase(), organization: orgKey};
    const buildRecord = {
      model: 'cicd_Build',
      record: {
        uid: build.id,
        name: build.displayName,
        number: build.number,
        startedAt: Utils.toDate(build.timestamp),
        endedAt: Utils.toDate(build.timestamp + build.duration),
        status: this.convertBuildStatus(build.result),
        url: jenkinsUrl.url,
        pipeline: {
          uid: pipeline.record.uid,
          organization: orgKey,
        },
      },
    };

    const createCommitRecords = this.shouldCreateCommitRecords(ctx);
    const res: DestinationRecord[] = [organization, pipeline, buildRecord];
    build.actions
      ?.filter((a) => a?._class === this.BUILD_DATA_CLASS)
      ?.forEach((a) => {
        const remoteUrls = a?.remoteUrls?.filter((u) => u !== null) ?? [];
        const repos = this.reposFromUrls(remoteUrls);
        const sha = a?.lastBuiltRevision?.SHA1;
        if (repos.length && sha) {
          for (const repo of repos) {
            const repoKey = {
              organization: {uid: toLower(repo.org), source: repo.source},
              name: toLower(repo.name),
              uid: toLower(repo.name),
            };

            res.push({
              model: 'cicd_BuildCommitAssociation',
              record: {
                build: {uid: build.id, pipeline: pipelineKey},
                commit: {repository: repoKey, sha, uid: sha},
              },
            });

            if (createCommitRecords) {
              res.push({
                model: 'vcs_Commit',
                record: {
                  sha,
                  repository: repoKey,
                  uid: sha,
                  message: sha,
                  htmlUrl: repo.org,
                },
              });
            }
          }
        }
      });

    return res;
  }

  private reposFromUrls(urls: ReadonlyArray<string>): ReadonlyArray<any> {
    const repos: any[] = [];
    for (const gitUrl of new Set(urls)) {
      const realGitUrl = parseGitUrl(gitUrl);
      const sourceToLower = realGitUrl.source?.toLowerCase();
      let source: string;
      if (sourceToLower?.includes('bitbucket')) source = RepoSource.BITBUCKET;
      else if (sourceToLower?.includes('gitlab')) source = RepoSource.GITLAB;
      else if (sourceToLower?.includes('github')) source = RepoSource.GITHUB;
      else source = RepoSource.VCS;
      repos.push({
        source: source,
        org: realGitUrl.organization,
        name: realGitUrl.name,
      });
    }
    return repos;
  }
  private convertBuildStatus(status: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!status) {
      return {category: 'Unknown', detail: null};
    }
    const detail = status.toLowerCase();

    // Read more on Jenkins build results:
    // 1. https://wiki.jenkins.io/display/jenkins/terminology
    // 2. https://github.com/jenkinsci/jenkins/blob/master/core/src/main/java/hudson/model/Result.java
    switch (detail) {
      case 'not_built':
      case 'aborted':
        return {category: 'Canceled', detail};
      case 'failure':
      case 'unstable':
        return {category: 'Failed', detail};
      case 'success':
        return {category: 'Success', detail};
      default:
        return {category: 'Unknown', detail};
    }
  }
}
