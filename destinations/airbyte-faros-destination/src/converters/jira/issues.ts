import axios from 'axios';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import parseGitUrl from 'git-url-parse';
import {
  invertBy,
  isPlainObject,
  isString,
  keyBy,
  mapValues,
  pick,
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
  PullRequestState,
  PullRequestStateCategory,
  PullRequestStream,
  Repo,
  RepoSource,
  Status,
  StatusValue,
} from './common';

const dependencyRegex = /((is (?<type>\w+))|tested) by/;
const sprintRegex = /([\w]+)=([\w-:. ]+)/g;
const statusCategories: ReadonlyMap<string, string> = new Map(
  ['Todo', 'InProgress', 'Done'].map((s) => [JiraCommon.normalize(s), s])
);
const typeCategories: ReadonlyMap<string, string> = new Map(
  ['Bug', 'Story', 'Task'].map((t) => [JiraCommon.normalize(t), t])
);

interface IssueStatusChange {
  readonly status: StatusValue;
  readonly changedAt: string;
}

export class Issues extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskProjectRelationship',
    'tms_TaskReleaseRelationship',
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
      Issues.issueFieldsStream,
      Issues.pullRequestsStream,
      Issues.workflowStatusesStream,
    ];
  }

  private static getFieldIdsByName(ctx: StreamContext): Dictionary<string[]> {
    const records = ctx.getAll(Issues.issueFieldsStream.asString);
    return invertBy(mapValues(records, (r) => r.record.data.name as string));
  }

  private static getFieldNamesById(ctx: StreamContext): Dictionary<string> {
    const records = ctx.getAll(Issues.issueFieldsStream.asString);
    return mapValues(records, (r) => r.record.data.name);
  }

  private static getStatusesByName(ctx: StreamContext): Dictionary<Status> {
    const records = ctx.getAll(Issues.workflowStatusesStream.asString);
    return keyBy(
      Object.values(records).map((r) => {
        const data = r.record.data;
        return {
          detail: data.name,
          category: statusCategories.get(
            JiraCommon.normalize(data.statusCategory.name)
          ),
        } as Status;
      }),
      (s) => s.detail
    );
  }

  private static fieldChangelog(
    changelog: ReadonlyArray<any>,
    field: string,
    fromField = 'fromString',
    valueField = 'toString'
  ): ReadonlyArray<{
    from: string;
    field: string;
    value: string;
    changed: Date;
  }> {
    const fieldChangelog = [];

    for (const change of changelog) {
      for (const item of change.items) {
        if (item.field === field) {
          const changed = Utils.toDate(change.created);
          if (!changed) {
            continue;
          }
          fieldChangelog.push({
            from: item[fromField],
            field,
            value: item[valueField],
            changed,
          });
        }
      }
    }
    return fieldChangelog;
  }

  private static assigneeChangelog(
    changelog: ReadonlyArray<any>,
    currentAssignee: any,
    created: Date
  ): ReadonlyArray<Assignee> {
    const assigneeChangelog: Array<Assignee> = [];

    const assigneeChanges = Issues.fieldChangelog(
      changelog,
      'assignee',
      'from',
      'to'
    );

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

  private statusChangelog(
    changelog: ReadonlyArray<any>
  ): ReadonlyArray<IssueStatusChange> {
    const statusChangelog: Array<IssueStatusChange> = [];

    const pushStatusChange = (
      oldValue: string,
      newValue: string,
      date: Date
    ): void => {
      const status = {
        newValue: newValue,
        oldValue: oldValue,
      };
      const isoDateString = new Date(date).toISOString();
      if (status) statusChangelog.push({status, changedAt: isoDateString});
    };

    const statusChanges = Issues.fieldChangelog(changelog, 'status');

    if (statusChanges.length) {
      for (const change of statusChanges) {
        pushStatusChange(change.value, change.from, change.changed);
      }
    }
    return statusChangelog;
  }

  private getIssueEpic(issue: Dictionary<any>): string | undefined {
    for (const id of this.fieldIdsByName[JiraCommon.EPIC_LINK_FIELD_NAME] ??
      []) {
      const epic = issue.fields[id];
      if (epic) {
        return epic.toString();
      }
    }
    if (issue.fields.issuetype?.name === JiraCommon.EPIC_TYPE_NAME) {
      return issue['key'];
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

  private getPoints(
    issue: Dictionary<any>,
    ctx: StreamContext
  ): number | undefined {
    for (const fieldName of JiraCommon.POINTS_FIELD_NAMES) {
      const fieldIds = this.fieldIdsByName[fieldName] ?? [];
      for (const fieldId of fieldIds) {
        const pointsString = issue.fields[fieldId];
        if (!pointsString) continue;
        let points;
        try {
          points = Utils.parseFloatFixedPoint(pointsString);
        } catch (err: any) {
          ctx.logger.warn(
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
    else if (lowerSource?.includes('azure')) source = RepoSource.AZURE;
    else source = RepoSource.VCS;
    return {
      source,
      org: gitUrl.organization,
      name: gitUrl.name,
    };
  }

  /**
   * Attempts to retrieve a field's value from several typical locations within
   * the field's JSON blob. If the blob is an array, then each item's value will
   * be added to an array of strings which will be an entry in the returned
   * object. Also each item in the array will be exploded across the returned
   * object with the key '<name>_<index>'. If nothing can be done, then
   * the JSON blob is set to the additional field's value after being stringified.
   *
   * @param name      The name of the additional field
   * @param jsonValue The field's JSON blob to retrieve the value from
   * @return          The Record of additional fields
   */
  private retrieveAdditionalFieldValue(
    ctx: StreamContext,
    name: string,
    jsonValue: any
  ): Record<string, string> {
    const additionalFields = {};

    if (!jsonValue || isString(jsonValue)) {
      additionalFields[name] = jsonValue;
      return additionalFields;
    }

    const retrievedValue = this.retrieveFieldValue(jsonValue);
    if (retrievedValue) {
      additionalFields[name] = this.stringifyNonString(retrievedValue);
      return additionalFields;
    }

    if (Array.isArray(jsonValue)) {
      // Truncate the array to the array limit
      const inputArray = jsonValue.slice(
        0,
        this.additionalFieldsArrayLimit(ctx)
      );

      const resultArray = inputArray.map((item, index) => {
        const val = this.retrieveFieldValue(item) ?? item;
        // Also explode each item across additional fields
        additionalFields[name + '_' + index] = this.stringifyNonString(val);
        return val;
      });

      additionalFields[name] = JSON.stringify(resultArray);
      return additionalFields;
    }

    // Nothing could be retrieved
    additionalFields[name] = this.stringifyNonString(jsonValue);
    return additionalFields;
  }

  /**
   * Check for existence of the members 'value', 'name' and then
   * 'displayName'in that order and return when one is found
   * (or undefined if none).
   *
   * @param jsonValue The object whose members should be considered
   * @returns         The value, name or displayName within the object
   */
  private retrieveFieldValue(jsonValue: any): any | undefined {
    let val;
    if (jsonValue?.value) {
      val = jsonValue.value;
    } else if (jsonValue?.name) {
      val = jsonValue.name;
    } else if (jsonValue?.displayName) {
      val = jsonValue.displayName;
    }
    return val;
  }

  private getPullRequests(
    ctx: StreamContext,
    issueId: string
  ): ReadonlyArray<PullRequest> {
    const source = 'jira';
    const pulls: PullRequest[] = [];
    const record = ctx.get(Issues.pullRequestsStream.asString, issueId);
    if (!record) return pulls;
    const detail = record.record.data as PullRequestStream;
    try {
      const branchToRepoUrl = new Map<string, string>();
      for (const branch of detail.branches ?? []) {
        branchToRepoUrl.set(branch.url, branch.repository.url);
      }
      for (const pull of detail.pullRequests ?? []) {
        const repoUrl = pull?.repositoryUrl;
        if (!repoUrl) {
          continue;
        }
        pulls.push({
          repo: Issues.extractRepo(repoUrl),
          number: Utils.parseInteger(pull.id.replace('#', '')),
          repoUrl: pull?.url,
          title: pull?.name,
          author: {uid: pull?.author.name, source: 'jira'},
          origin: source,
          mergedAt: pull?.lastUpdate,
          state: this.convertPullRequestState(pull?.status),
        });
      }
    } catch (err: any) {
      ctx.logger.warn(
        `Failed to get pull requests for issue ${issueId}: ${err.message}`
      );
    }
    return pulls;
  }

  convertPullRequestState(status: string): PullRequestState {
    switch (status.toLowerCase()) {
      case 'completed':
        return {
          category: PullRequestStateCategory.Closed,
          detail: status,
        };
      case 'merged':
        return {
          category: PullRequestStateCategory.Merged,
          detail: status,
        };
      case 'open':
        return {
          category: PullRequestStateCategory.Open,
          detail: status,
        };
      default:
        return {
          category: PullRequestStateCategory.Custom,
          detail: status,
        };
    }
  }

  private stringifyNonString(value: any): string {
    return isString(value) ? value : JSON.stringify(value);
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const issue = record.record.data;
    const source = this.streamName.source;
    const results: DestinationRecord[] = [];
    const organizationName = this.getOrganizationFromUrl(issue.self);
    const organization = {uid: organizationName, source};

    if (!this.fieldIdsByName) {
      this.fieldIdsByName = Issues.getFieldIdsByName(ctx);
    }
    if (!this.fieldNameById) {
      this.fieldNameById = Issues.getFieldNamesById(ctx);
    }
    if (!this.statusByName) {
      this.statusByName = Issues.getStatusesByName(ctx);
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
          board: {uid: issue.projectKey, source, organization},
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
      const projectRepo = pull?.repo?.name;
      const repository = {
        name: projectRepo,
        uid: projectRepo,
        organization,
      };
      const pullRequest = {
        number: pull.number,
        uid: pull.number.toString(),
        repository,
        url: pull.repoUrl,
        title: pull.title,
        state: pull.state,
        author: pull.author,
        mergedAt: pull.mergedAt,
        origin: pull.origin,
      };
      results.push({
        model: 'tms_TaskPullRequestAssociation',
        record: {
          task: {uid: issue.key, organization},
          pullRequest,
        },
      });
    }

    const created = Utils.toDate(issue.fields.created);
    const assignee =
      issue.fields.assignee?.emailAddress || issue.fields.assignee?.name;
    const changelog: any[] = issue.changelog?.histories || [];
    changelog.sort((e1, e2) => {
      // Sort changes from least to most recent
      const created1 = +(Utils.toDate(e1.created) || new Date(0));
      const created2 = +(Utils.toDate(e2.created) || new Date(0));
      return created1 - created2;
    });
    const assigneeChangelog = Issues.assigneeChangelog(
      changelog,
      assignee,
      created
    );
    for (const assignee of assigneeChangelog) {
      results.push({
        model: 'tms_TaskAssignment',
        record: {
          task: {uid: issue.key, source},
          assignee: {uid: assignee.uid || 'Unassigned', source},
          assignedAt: assignee.assignedAt,
          source,
        },
      });
    }

    const fixVersionChangelog = Issues.fieldChangelog(
      changelog,
      'Fix Version',
      'from',
      'to'
    );
    const now = Date.now();
    for (const [i, change] of fixVersionChangelog.entries()) {
      if (change.from) {
        results.push({
          model: 'tms_TaskReleaseRelationship__Deletion',
          record: {
            at: now + i,
            where: {
              task: {uid: issue.key, source},
              release: {uid: change.from, source},
            },
          },
        });
      }
      if (change.value) {
        results.push({
          model: 'tms_TaskReleaseRelationship__Upsert',
          record: {
            at: now + i,
            data: {
              task: {uid: issue.key, source},
              release: {uid: change.value, source},
            },
          },
        });
      }
    }
    for (const fixVersion of issue.fields.fixVersions ?? []) {
      results.push({
        model: 'tms_TaskReleaseRelationship__Upsert',
        record: {
          at: Date.now(),
          data: {
            task: {uid: issue.key, source},
            release: {uid: fixVersion.id, source},
          },
        },
      });
    }

    const statusChangelog = this.statusChangelog(changelog);
    // Timestamp of most recent status change
    let statusChanged: string | undefined;
    if (statusChangelog.length) {
      statusChanged = statusChangelog[statusChangelog.length - 1].changedAt;
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
    let additionalFieldsMap: Record<string, string> = {};
    for (const [id, name] of Object.entries(this.fieldNameById)) {
      const value = issue.fields[id];
      if (
        Issues.standardFieldIds.includes(id) ||
        Issues.fieldsToIgnore.includes(name)
      ) {
        continue;
      } else if (name && value) {
        try {
          additionalFieldsMap = Object.assign(
            additionalFieldsMap,
            this.retrieveAdditionalFieldValue(ctx, name, value)
          );
        } catch (err) {
          ctx.logger.warn(
            `Failed to extract custom field ${name} on issue ${issue.id}. Skipping.`
          );
        }
      }
    }

    const additionalFields: any[] = [];
    for (const [name, value] of Object.entries(additionalFieldsMap)) {
      additionalFields.push({name, value});
    }

    let description = null;
    if (typeof issue.fields.description === 'string') {
      description = issue.fields.description;
    } else if (issue.renderedFields?.description) {
      description = this.turndown.turndown(issue.renderedFields.description);
    }

    const creator =
      issue.fields.creator?.emailAddress || issue.fields.creator?.accountId;
    const parent = issue.fields.parent?.key
      ? {
          key: issue.fields.parent?.key,
          type: issue.fields.parent?.fields?.issuetype?.name,
        }
      : null;
    const epicKey =
      parent?.type === 'Epic' ? parent.key : this.getIssueEpic(issue);
    const sprint = this.getSprintId(issue);
    const type = issue.fields.issuetype?.name;

    const task = {
      uid: issue.key,
      name: issue.fields.summary,
      description: this.truncate(ctx, description),
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
      points: this.getPoints(issue, ctx) ?? null,
      creator: creator ? {uid: creator, source} : null,
      parent: parent?.key ? {uid: parent.key, source} : null,
      epic: epicKey ? {uid: epicKey, source} : null,
      sprint: sprint ? {uid: sprint, source} : null,
      source,
      additionalFields,
      organization,
      url: issue?.self,
    };

    const excludeFields = this.excludeFields(ctx);
    if (excludeFields.size > 0) {
      const keys = Object.keys(task).filter((f) => !excludeFields.has(f));
      results.push({model: 'tms_Task', record: pick(task, keys)});
    } else {
      results.push({model: 'tms_Task', record: task});
    }

    return results;
  }
}
