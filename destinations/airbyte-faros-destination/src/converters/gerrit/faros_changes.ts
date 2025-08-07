import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GerritCommon, GerritConverter} from './common';

export class FarosChanges extends GerritConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_User',
    'tms_Task',
  ];

  source = 'gerrit';

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const change = record.record.data;
    const source = this.gerritSource();
    
    // Extract org and repo from project name
    const {org, repo} = GerritCommon.extractProjectOrg(change.project);
    const repository = {
      name: repo,
      uid: repo,
      organization: {
        uid: org,
        source,
      },
    };

    const res: DestinationRecord[] = [];

    // Map change status to pull request state
    const state = GerritCommon.mapChangeStatus(change.status);

    // Create author user
    if (change.owner) {
      res.push(GerritCommon.vcs_User(change.owner, source));
    }

    // Create submitter user if exists
    if (change.submitter) {
      res.push(GerritCommon.vcs_User(change.submitter, source));
    }

    // Calculate approval state from labels
    let approvalState = null;
    if (change.labels?.['Code-Review']) {
      const codeReview = change.labels['Code-Review'];
      if (codeReview.approved) {
        approvalState = {category: 'Approved', detail: 'Code-Review +2'};
      } else if (codeReview.rejected) {
        approvalState = {category: 'ChangesRequested', detail: 'Code-Review -2'};
      }
    }

    // Create vcs_PullRequest
    const pullRequestUid = `${change._number}`;
    res.push({
      model: 'vcs_PullRequest',
      record: {
        number: change._number,
        uid: pullRequestUid,
        title: change.subject,
        description: Utils.cleanAndTruncate(change.subject),
        state,
        approvalState,
        url: `${ctx.config.source_specific_configs?.server_url || ''}/c/${change.project}/+/${change._number}`,
        createdAt: Utils.toDate(change.created),
        updatedAt: Utils.toDate(change.updated),
        mergedAt: change.submitted ? Utils.toDate(change.submitted) : null,
        draft: !change.has_review_started,
        repository,
        author: change.owner ? {
          uid: change.owner.username || change.owner.email || `user_${change.owner._account_id}`,
          source,
        } : null,
        mergeCommit: change.current_revision ? {
          sha: change.current_revision,
          uid: change.current_revision,
          repository,
        } : null,
        commentCount: change.total_comment_count || 0,
      },
    });

    // Create TMS task for the change
    const taskKey = {
      uid: GerritCommon.sanitizeUid(`${change.project}/${change._number}`),
      source,
    };
    
    const taskBoardKey = {
      uid: GerritCommon.sanitizeUid(change.project),
      source,
    };

    res.push({
      model: 'tms_Task',
      record: {
        ...taskKey,
        name: change.subject,
        description: Utils.cleanAndTruncate(change.subject),
        type: {category: 'Review', detail: 'Gerrit Change'},
        status: state,
        statusChangedAt: Utils.toDate(change.updated),
        createdAt: Utils.toDate(change.created),
        updatedAt: Utils.toDate(change.updated),
        creator: change.owner ? {
          uid: change.owner.username || change.owner.email || `user_${change.owner._account_id}`,
          source,
        } : null,
        board: taskBoardKey,
        parent: change.topic ? {
          uid: GerritCommon.sanitizeUid(`${change.project}/topic/${change.topic}`),
          source,
        } : null,
      },
    });

    return res;
  }
}