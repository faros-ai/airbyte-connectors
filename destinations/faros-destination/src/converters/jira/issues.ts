import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import parseGitUrl from 'git-url-parse';
import {
  invertBy,
  isPlainObject,
  isString,
  keyBy,
  last,
  mapValues,
  toLower,
} from 'lodash';
import {Dictionary} from 'ts-essentials';
import TurndownService from 'turndown';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {
  Assignee,
  JiraCommon,
  JiraConverter,
  PullRequest,
  Repo,
  RepoSource,
  Status,
} from './common';

const dependencyRegex = /((is (?<type>\w+))|tested) by/;
const sprintRegex = /([\w]+)=([\w-:. ]+)/g;
const statusCategories: ReadonlyMap<string, string> = new Map(
  ['Todo', 'InProgress', 'Done'].map((s) => [JiraCommon.normalize(s), s])
);
const typeCategories: ReadonlyMap<string, string> = new Map(
  ['Bug', 'Story', 'Task'].map((t) => [JiraCommon.normalize(t), t])
);

export class JiraIssues extends JiraConverter {
  private logger = new AirbyteLogger();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskProjectRelationship',
    'tms_TaskBoardRelationship',
    'tms_TaskAssignment',
    'tms_TaskDependency',
    'tms_TaskTag',
    'tms_TaskPullRequestAssociation',
  ];

  private static readonly issueFieldsStream = new StreamName(
    'jira',
    'issue_fields'
  );
  private static readonly pullRequestsStream = new StreamName(
    'jira',
    'pull_requests'
  );
  private static readonly workflowStatusesStream = new StreamName(
    'jira',
    'workflow_statuses'
  );

  private static readonly standardFieldIds = [
    'assignee',
    'created',
    'creator',
    'description',
    'issuelinks',
    'issuetype',
    'labels',
    'parent',
    'priority',
    'project',
    'status',
    'subtasks',
    'summary',
    'updated',
  ];

  private static readonly fieldsToIgnore = [
    ...JiraCommon.POINTS_FIELD_NAMES,
    JiraCommon.DEV_FIELD_NAME,
    JiraCommon.EPIC_LINK_FIELD_NAME,
    JiraCommon.SPRINT_FIELD_NAME,
  ];

  private fieldIdsByName?: Dictionary<string[]>;
  private fieldNameById?: Dictionary<string>;
  private statusByName?: Dictionary<Status>;

  private turndown = new TurndownService();

  override get dependencies(): ReadonlyArray<StreamName> {
    return [
      JiraIssues.issueFieldsStream,
      JiraIssues.pullRequestsStream,
      JiraIssues.workflowStatusesStream,
    ];
  }

  private static getFieldIdsByName(ctx: StreamContext): Dictionary<string[]> {
    const records = ctx.getAll(JiraIssues.issueFieldsStream.asString) ?? {};
    return invertBy(mapValues(records, (r) => r.record.data.name as string));
  }

  private static getFieldNamesById(ctx: StreamContext): Dictionary<string> {
    const records = ctx.getAll(JiraIssues.issueFieldsStream.asString) ?? {};
    return mapValues(records, (r) => r.record.data.name);
  }

  private static getStatusesByName(ctx: StreamContext): Dictionary<Status> {
    const records =
      ctx.getAll(JiraIssues.workflowStatusesStream.asString) ?? {};
    return keyBy(
      Object.values(records).map((r) => {
        const data = r.record.data;
        return {
          detail: data.name,
          category: data.statusCategory.name,
        } as Status;
      }),
      (s) => s.detail
    );
  }

  private static fieldChangelog(
    changelog: ReadonlyArray<any>,
    field: string,
    valueField = 'toString'
  ): ReadonlyArray<{
    from: string;
    field: string;
    value: string;
    changed: Date;
  }> {
    const fieldChangelog = [];
    // Changelog entries are sorted from most to least recent
    for (const change of changelog) {
      for (const item of change.items) {
        if (item.field === field) {
          const changed = Utils.toDate(change.created);
          if (!changed) {
            continue;
          }
          fieldChangelog.push({
            from: item.from,
            field,
            value: item[valueField],
            changed,
          });
        }
      }
    }
    return fieldChangelog;
  }

  static assigneeChangelog(
    changelog: ReadonlyArray<any>,
    currentAssignee: any,
    created: Date
  ): ReadonlyArray<Assignee> {
    const assigneeChangelog: Array<Assignee> = [];

    // sort assignees from earliest to latest
    const assigneeChanges = [
      ...JiraIssues.fieldChangelog(changelog, 'assignee', 'to'),
    ].reverse();

    if (assigneeChanges.length) {
      // case where task was already assigned at creation
      const firstChange = assigneeChanges[0];
      if (firstChange.from) {
        const assignee = {uid: firstChange.from, assignedAt: created};
        assigneeChangelog.push(assignee);
      }

      for (const change of assigneeChanges) {
        const assignee = {uid: change.value, assignedAt: change.changed};
        assigneeChangelog.push(assignee);
      }
    } else if (currentAssignee) {
      // if task was assigned at creation and never changed
      assigneeChangelog.push({uid: currentAssignee, assignedAt: created});
    }
    return assigneeChangelog;
  }

  private getIssueEpic(issue: Dictionary<any>): string | undefined {
    for (const id of this.fieldIdsByName[JiraCommon.EPIC_LINK_FIELD_NAME] ??
      []) {
      const epic = issue.fields[id];
      if (epic) {
        return epic.toString();
      }
    }
    return undefined;
  }

  private getSprintId(issue: Dictionary<any>): string | undefined {
    const sprints = [];
    for (const fieldId of this.fieldIdsByName[JiraCommon.SPRINT_FIELD_NAME] ??
      []) {
      for (const sprint of issue.fields[fieldId] ?? []) {
        // Workaround for string representation of sprint details which are supposedly deprecated
        // https://developer.atlassian.com/cloud/jira/platform/deprecation-notice-tostring-representation-of-sprints-in-get-issue-response/
        if (typeof sprint === 'string') {
          let match;
          const details = {};
          while ((match = sprintRegex.exec(sprint)) !== null) {
            details[match[1]] = match[2];
          }
          sprints.push(details);
        } else if (isPlainObject(sprint)) {
          sprints.push({
            id: sprint.id?.toString(),
            state: sprint.state,
            startDate: sprint.startDate,
            endDate: sprint.endDate,
          });
        }
      }
    }
    // Sort array in descending order of end date sprints and return the first
    // one. Future sprints may not have end dates but will take precedence.
    sprints.sort(function (l, r) {
      const lDate = Utils.toDate(l.endDate);
      const rDate = Utils.toDate(r.endDate);
      if (rDate && lDate) {
        return rDate.getTime() - lDate.getTime();
      } else if (toLower(l.state) === 'future') {
        return -1;
      }
      return 1;
    });
    return sprints[0]?.id;
  }

  private getPoints(issue: Dictionary<any>): number | undefined {
    for (const fieldName of JiraCommon.POINTS_FIELD_NAMES) {
      const fieldIds = this.fieldIdsByName[fieldName] ?? [];
      for (const fieldId of fieldIds) {
        const pointsString = issue.fields[fieldId];
        if (!pointsString) continue;
        let points;
        try {
          points = Utils.parseFloatFixedPoint(pointsString);
        } catch (err: any) {
          this.logger.warn(
            `Failed to get story points for issue ${issue.key}: ${err.message}`
          );
        }
        return points;
      }
    }
    return undefined;
  }

  private static extractRepo(repoUrl: string): Repo {
    const gitUrl = parseGitUrl(repoUrl);
    const lowerSource = gitUrl.source?.toLowerCase();
    let source: RepoSource;
    if (lowerSource?.includes('bitbucket')) source = RepoSource.BITBUCKET;
    else if (lowerSource?.includes('gitlab')) source = RepoSource.GITLAB;
    else if (lowerSource?.includes('github')) source = RepoSource.GITHUB;
    else source = RepoSource.VCS;
    return {
      source,
      org: gitUrl.organization,
      name: gitUrl.name,
    };
  }

  private getPullRequests(
    ctx: StreamContext,
    issueId: string
  ): ReadonlyArray<PullRequest> {
    const pulls: PullRequest[] = [];
    const record = ctx.get(JiraIssues.pullRequestsStream.asString, issueId);
    if (!record) return pulls;
    const detail = record.record.data;
    try {
      const branchToRepoUrl = new Map<string, string>();
      for (const branch of detail.branches ?? []) {
        branchToRepoUrl.set(branch.url, branch.repository.url);
      }
      for (const pull of detail.pullRequests ?? []) {
        const repoUrl = branchToRepoUrl.get(pull.source?.url);
        if (!repoUrl) {
          continue;
        }
        pulls.push({
          repo: JiraIssues.extractRepo(repoUrl),
          number: Utils.parseInteger(pull.id.replace('#', '')),
        });
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to get pull requests for issue ${issueId}: ${err.message}`
      );
    }
    return pulls;
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const issue = record.record.data;
    const source = this.streamName.source;
    const results: DestinationRecord[] = [];

    if (!this.fieldIdsByName) {
      this.fieldIdsByName = JiraIssues.getFieldIdsByName(ctx);
    }
    if (!this.fieldNameById) {
      this.fieldNameById = JiraIssues.getFieldNamesById(ctx);
    }
    if (!this.statusByName) {
      this.statusByName = JiraIssues.getStatusesByName(ctx);
    }

    results.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        task: {uid: issue.key, source},
        project: {uid: issue.projectKey, source},
      },
    });
    if (!this.useBoardOwnership(ctx)) {
      results.push({
        model: 'tms_TaskBoardRelationship',
        record: {
          task: {uid: issue.key, source},
          board: {uid: issue.projectKey, source},
        },
      });
    }
    for (const label of issue.fields.labels) {
      results.push({
        model: 'tms_TaskTag',
        record: {label: {name: label}, task: {uid: issue.key, source}},
      });
    }

    const pulls = this.getPullRequests(ctx, issue.id);
    for (const pull of pulls) {
      results.push({
        model: 'tms_TaskPullRequestAssociation',
        record: {
          task: {uid: issue.key, source},
          pullRequest: {
            repository: {
              organization: {
                source: pull.repo.source,
                uid: toLower(pull.repo.org),
              },
              name: toLower(pull.repo.name),
            },
            number: pull.number,
          },
        },
      });
    }

    const created = Utils.toDate(issue.fields.created);
    const assignee =
      issue.fields.assignee?.accountId || issue.fields.assignee?.name;
    const changelog: any[] = issue.changelog?.histories || [];
    changelog.sort((e1, e2) => {
      // Sort changes from most to least recent
      const created1 = +(Utils.toDate(e1.created) || new Date(0));
      const created2 = +(Utils.toDate(e2.created) || new Date(0));
      return created2 - created1;
    });
    const assigneeChangelog = JiraIssues.assigneeChangelog(
      changelog,
      assignee,
      created
    );
    for (const assignee of assigneeChangelog) {
      results.push({
        model: 'tms_TaskAssignment',
        record: {
          task: {uid: issue.key, source},
          assignee: {uid: assignee.uid, source},
          assignedAt: assignee.assignedAt,
        },
      });
    }

    const statusChangelog: any[] = [];
    for (const change of JiraIssues.fieldChangelog(changelog, 'status')) {
      const status = this.statusByName[change.value];
      if (status) {
        statusChangelog.push({
          status: {
            category: statusCategories.get(
              JiraCommon.normalize(status.category)
            ),
            detail: status.detail,
          },
          changedAt: change.changed,
        });
      }
    }
    // Timestamp of most recent status change
    let statusChanged: Date | undefined;
    if (statusChangelog.length) {
      statusChanged = last(statusChangelog).changedAt;
    }

    for (const link of issue.fields.issuelinks ?? []) {
      const match = link.type.inward?.match(dependencyRegex);
      const dependency = link.inwardIssue?.key;
      if (match && dependency) {
        const blocking = match.groups.type === 'blocked';
        results.push({
          model: 'tms_TaskDependency',
          record: {
            dependentTask: {uid: issue.key, source},
            fulfillingTask: {uid: dependency, source},
            blocking,
          },
        });
      }
    }

    // Rewrite keys of additional fields to use names instead of ids
    const additionalFields: any[] = [];
    for (const [id, name] of Object.entries(this.fieldNameById)) {
      let value = issue.fields[id];
      if (
        JiraIssues.standardFieldIds.includes(id) ||
        JiraIssues.fieldsToIgnore.includes(name)
      ) {
        continue;
      } else if (name && value) {
        try {
          // Stringify arrays, objects, booleans, and numbers
          value = isString(value) ? value : JSON.stringify(value);
          additionalFields.push({name, value});
        } catch (err) {
          this.logger.warn(
            `Failed to extract custom field ${name} on issue ${issue.id}. Skipping.`
          );
        }
      }
    }

    let description = null;
    if (typeof issue.fields.description === 'string') {
      description = issue.fields.description;
    } else if (issue.renderedFields?.description) {
      description = this.turndown.turndown(issue.renderedFields.description);
    }

    const creator =
      issue.fields.creator?.accountId || issue.fields.creator?.name;
    const parent = issue.fields.parent?.key
      ? {
          key: issue.fields.parent?.key,
          type: issue.fields.parent?.fields?.issuetype?.name,
        }
      : null;
    const epicKey =
      parent?.type === 'Epic' ? parent.key : this.getIssueEpic(issue);
    // TODO: PRs
    const sprint = this.getSprintId(issue);
    const type = issue.fields.issuetype?.name;

    results.push({
      model: 'tms_Task',
      record: {
        uid: issue.key,
        name: issue.fields.summary,
        description,
        type: {
          category: typeCategories.get(JiraCommon.normalize(type)) ?? 'Custom',
          detail: type,
        },
        status: {
          category: statusCategories.get(
            JiraCommon.normalize(issue.fields.status?.statusCategory?.name)
          ),
          detail: issue.fields.status?.name,
        },
        priority: issue.fields.priority?.name,
        createdAt: created,
        updatedAt: Utils.toDate(issue.fields.updated),
        statusChangedAt: statusChanged,
        statusChangelog,
        points: this.getPoints(issue) ?? null,
        creator: creator ? {uid: creator, source} : null,
        parent: parent?.key ? {uid: parent.key, source} : null,
        epic: epicKey ? {uid: epicKey, source} : null,
        sprint: sprint ? {uid: sprint, source} : null,
        source,
        additionalFields,
      },
    });

    return results;
  }
}
