import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/gitlab';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {GroupStreamSlice, StreamBase, StreamWithGroupSlices} from './common';

export class FarosCommits extends StreamWithGroupSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosCommits.json');
  }

  get primaryKey(): StreamKey {
    return ['group_id', 'project_id', 'oid'];
  }

  get cursorField(): string {
    return 'authoredDate';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: GroupStreamSlice,
    streamState?: any
  ): AsyncGenerator<Commit> {
    const group = streamSlice?.group;
    const gitlab = await GitLab.instance(this.config, this.logger);
    
    const groupKey = StreamBase.groupKey(group);
    const cutoff = streamState?.[groupKey]?.cutoff;
    const [startDate, endDate] = this.getUpdateRange(cutoff);

    for (const {repo: project, syncRepoData} of await this.groupFilter.getProjects(group)) {
      if (!syncRepoData) continue;

      const commits = await gitlab.getCommits(project.id, {
        since: startDate,
        until: endDate,
        withStats: true,
      });

      for (const commit of commits) {
        yield this.transformCommit(commit, project, group);
      }
    }
  }

  private transformCommit(gitlabCommit: any, project: any, group: string): Commit {
    return {
      org: group,
      repo: project.path_with_namespace,
      branch: project.default_branch || 'main',
      oid: gitlabCommit.id,
      message: gitlabCommit.message || '',
      url: gitlabCommit.web_url,
      authoredDate: gitlabCommit.authored_date,
      author: {
        name: gitlabCommit.author_name,
        email: gitlabCommit.author_email,
      },
      committer: {
        name: gitlabCommit.committer_name,
        email: gitlabCommit.committer_email,
      },
      additions: gitlabCommit.stats?.additions || 0,
      deletions: gitlabCommit.stats?.deletions || 0,
      changedFilesIfAvailable: gitlabCommit.stats?.total || 0,
      group_id: project.group_id,
      project_id: project.id,
    };
  }
}
