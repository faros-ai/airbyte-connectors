import {AirbyteLogger} from 'faros-airbyte-cdk';
import {normalizeString} from 'faros-airbyte-common/common';
import {
  Assignee,
  Dependency,
  Issue,
  SprintHistory,
  SprintInfo,
  Status,
} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {
  difference,
  isNil,
  isPlainObject,
  isString,
  toLower,
  toString,
} from 'lodash';

// Check for field name differences between classic and next-gen projects
// for fields to promote to top-level fields.
// https://community.atlassian.com/t5/Jira-Software-questions/Story-point-and-story-point-estimate-duplicate-fields/qaq-p/904742
const DEV_FIELD_NAME = 'Development';
const POINTS_FIELD_NAMES: ReadonlyArray<string> = [
  'Story Points',
  'Story point estimate',
];

// Epic Link and Sprint are custom fields
const EPIC_LINK_FIELD_NAME = 'Epic Link';
// https://community.developer.atlassian.com/t/jira-api-v3-include-sprint-in-get-issue-search/35411
const SPRINT_FIELD_NAME = 'Sprint';
const EPIC_TYPE_NAME = 'Epic';

// PR info attached to issues can vary by Jira instance. Known patterns:
// 1. pullrequest={dataType=pullrequest, state=MERGED, stateCount=1}
// 2. PullRequestOverallDetails{openCount=1, mergedCount=1, declinedCount=0}

const sprintRegex = /([\w]+)=([\w-:. ]+)/g;

export class IssueTransformer {
  constructor(
    // Pass base url to enable creating issue url that can navigated in browser
    // https://community.atlassian.com/t5/Jira-questions/How-can-I-get-an-issue-url-that-can-be-navigated-to-in-the/qaq-p/1500948
    private readonly baseURL: string,
    private readonly fieldNameById: Map<string, string>,
    private readonly fieldIdsByName: Map<string, string[]>,
    private readonly statusByName: Map<string, Status>,
    private readonly additionalFieldIds: string[],
    private readonly additionalFieldsArrayLimit: number,
    private readonly logger?: AirbyteLogger
  ) {}

  private static assigneeChangelog(
    changelog: ReadonlyArray<any>,
    currentAssignee: any,
    created: Date
  ): ReadonlyArray<Assignee> {
    const assigneeChangelog: Array<Assignee> = [];

    const assigneeChanges = IssueTransformer.fieldChangelog(
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
        // TODO: Review handling unassignment
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
    changelog: ReadonlyArray<any>,
    currentStatus: string,
    created: Date
  ): ReadonlyArray<[Status, Date]> {
    const statusChangelog: Array<[Status, Date]> = [];

    const pushStatusChange = (statusName: string, date: Date): void => {
      const normalizedName = normalizeString(statusName);
      const status = this.statusByName.get(normalizedName);
      if (status) {
        statusChangelog.push([status, date]);
      } else {
        this.logger?.warn(
          `Status '${statusName}' not found in statuses, reverting to original status`
        );
        statusChangelog.push([
          {category: statusName, detail: statusName},
          date,
        ]);
      }
    };

    const statusChanges = IssueTransformer.fieldChangelog(changelog, 'status');

    if (statusChanges.length) {
      // status that was assigned at creation
      const firstChange = statusChanges[0];
      if (firstChange.from) {
        pushStatusChange(firstChange.from, created);
      }
      for (const change of statusChanges) {
        pushStatusChange(change.value, change.changed);
      }
    } else if (currentStatus) {
      // if task was given status at creation and never changed
      pushStatusChange(currentStatus, created);
    }
    return statusChangelog;
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
    typeChange?: {from: string; to: string};
  }> {
    const fieldChangelog = [];
    // Changelog entries are sorted from least to most recent
    for (const change of changelog) {
      const typeChange = IssueTransformer.getIssueChangeType(change.items);
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
            typeChange,
          });
        }
      }
    }
    return fieldChangelog;
  }

  private static getIssueChangeType(
    items: ReadonlyArray<any>
  ): {from: string; to: string} | undefined {
    for (const item of items) {
      if (item.field === 'issuetype') {
        return {from: item.fromString, to: item.toString};
      }
    }
  }

  private static getSprintFromField(
    sprints: any,
    current?: ReadonlyArray<string>
  ): string | undefined {
    // Sort array in descending order of sprint completeDate and return the first
    // one. Future sprints / active may not have end dates but will take precedence.
    const ctx = current
      ? sprints.filter((s) => current.includes(s.id))
      : sprints;
    const sprint = ctx.find((s) => {
      const state = toLower(s.state);
      return state === 'future' || state === 'active';
    });
    if (sprint) {
      return sprint.id;
    }
    ctx.sort((l, r) => {
      const lDate = +(Utils.toDate(l.completeDate) || new Date(0));
      const rDate = +(Utils.toDate(r.completeDate) || new Date(0));
      return rDate - lDate;
    });
    return toString(ctx[0]?.id);
  }

  private sprintHistory(
    key: string,
    changelog: ReadonlyArray<any>,
    sprints: ReadonlyArray<any>,
    created: Date,
    type: string
  ): SprintInfo {
    const sprintChanges = IssueTransformer.fieldChangelog(
      changelog,
      'Sprint',
      'from',
      'to'
    );

    // Sub-tasks which never had any sprint changes should be ignored
    if (type === 'Sub-task' && !sprintChanges.length) {
      return;
    }
    const sprintHistory = [];
    const sprintAtCreation = IssueTransformer.getSprintFromField(sprints);
    // When sprint was assigned at task creation but no changes after
    // use the sprint from the sprint field
    if (!sprintChanges.length && sprintAtCreation) {
      return {
        currentSprintId: sprintAtCreation,
        history: [{uid: sprintAtCreation, addedAt: created}],
      };
    }

    let currentSprint;
    let hasInheritedSprint = false;
    // Sprint field value is a list
    let currentSprintValue: string[] = Utils.toStringList(
      sprintChanges[0]?.from
    );
    const initialChangedAt = new Date(sprintChanges[0]?.changed);
    // When sprint was already assigned at creation, use the sprint which
    // it has now changed from
    if (currentSprintValue.length == 1) {
      currentSprint = {uid: currentSprintValue[0], addedAt: created};
    } else if (currentSprintValue.length > 1) {
      // If the first change has multiple sprints compute the sprint
      // from the sprint field
      const sprint = IssueTransformer.getSprintFromField(
        sprints,
        currentSprintValue
      );
      currentSprint = {uid: sprint, addedAt: initialChangedAt};
    }

    for (const change of sprintChanges ?? []) {
      currentSprintValue =
        currentSprintValue ?? Utils.toStringList(change.from);
      const newSprintValue = Utils.toStringList(change.value);

      // FAI-2742, FAI-8034: When an issue changes from sub-task, there are
      // instances the changelog reflects the sprint being set to empty.
      // Ignore this as the new task remains in the same sprint.
      const typeChange = change?.typeChange;
      if (typeChange?.from === 'Sub-task') {
        currentSprintValue = undefined;
        hasInheritedSprint = false;
        continue;
      } else if (typeChange?.to === 'Sub-task') {
        // FAI-2742: When an issue changes to sub-task, it inherits the sprint of the
        // parent task. Changelog no longer reflects the sprint changes from the
        // sprint. Will mark it as removed from the sprint
        hasInheritedSprint = true;
      }

      if (currentSprint) {
        currentSprint.removedAt = change.changed;
        sprintHistory.push(currentSprint);
        currentSprint = undefined;
        if (hasInheritedSprint) {
          hasInheritedSprint = false;
          currentSprintValue = undefined;
          continue;
        }
      }

      // When a sprint is removed to a future sprint, the new value is not
      // always appended to end of the list, get from difference of sprint values
      const diff = difference(newSprintValue, currentSprintValue);
      if (diff.length > 1) {
        this.logger?.warn(
          `Issue ${key} sprint difference from ${currentSprintValue} to ` +
            `${newSprintValue} has more one value: ${diff.join(',')}. ` +
            `Will be marked as removed from current sprint`
        );
      } else if (diff[0]) {
        currentSprint = {uid: diff[0], addedAt: change.changed};
      }
      currentSprintValue = undefined;
    }

    // Add current sprint to sprint history
    if (currentSprint) {
      sprintHistory.push(currentSprint);
    }
    return {
      currentSprintId: currentSprint?.uid,
      history: IssueTransformer.uniqueSprintHistory(sprintHistory),
    };
  }

  // Filter out duplicate sprint history entries when task moves to same sprint
  // multiple times
  private static uniqueSprintHistory(
    sprintHistory: ReadonlyArray<SprintHistory>
  ): ReadonlyArray<SprintHistory> {
    const uniqueSprints: Record<string, SprintHistory> = {};

    // Iterate through the list to update with most recent
    sprintHistory.forEach((s) => {
      const existingSprint = uniqueSprints[s.uid];

      if (!existingSprint || s.addedAt > existingSprint.addedAt) {
        uniqueSprints[s.uid] = s;
      }
    });

    return Object.values(uniqueSprints);
  }

  private getPoints(item: {
    key: string;
    fields: {[f: string]: any};
  }): number | undefined {
    for (const fieldName of POINTS_FIELD_NAMES) {
      const fieldIds = this.fieldIdsByName.get(fieldName) ?? [];
      for (const fieldId of fieldIds) {
        const pointsString = item.fields[fieldId];
        if (!isNil(pointsString)) {
          let points;
          try {
            points = Utils.parseFloatFixedPoint(pointsString);
          } catch (err: any) {
            this.logger?.warn(
              `Failed to get story points for issue ${item.key}`,
              err.message
            );
          }
          return points;
        }
      }
    }
    return undefined;
  }

  private getIssueEpic(item: {fields: {[f: string]: any}}): string | undefined {
    for (const id of this.fieldIdsByName.get(EPIC_LINK_FIELD_NAME) ?? []) {
      const epic = item.fields[id];
      if (epic) {
        return epic.toString();
      }
    }
    if (item.fields.issuetype?.name === EPIC_TYPE_NAME) {
      return item['key'];
    }
    return undefined;
  }

  private getIssueSprints(item: {fields: {[f: string]: any}}): any[] {
    const sprints = [];
    for (const fieldId of this.fieldIdsByName.get(SPRINT_FIELD_NAME) ?? []) {
      for (const sprint of item.fields[fieldId] ?? []) {
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
            completeDate: sprint.completeDate,
          });
        }
      }
    }
    return sprints;
  }

  toIssue(item: any): Issue {
    const dependencies: Dependency[] = [];
    for (const link of item.fields.issuelinks ?? []) {
      const dependency = link.inwardIssue?.key;
      if (dependency) {
        dependencies.push({
          key: dependency,
          inward: link.type.inward,
          outward: link.type.outward,
        });
      }
    }

    const additionalFields: [string, string][] =
      this.extractAdditionalFields(item);

    const created = Utils.toDate(item.fields.created);
    const assignee =
      item.fields.assignee?.accountId ||
      item.fields.assignee?.key ||
      item.fields.assignee?.name;

    const changelog: any[] = item.changelog?.histories ?? [];
    changelog.sort((e1, e2) => {
      // Sort changes from least to most recent
      const created1 = +(Utils.toDate(e1.created) || new Date(0));
      const created2 = +(Utils.toDate(e2.created) || new Date(0));
      return created1 - created2;
    });

    const keyChangelog: [string, Date][] = [];
    for (const change of IssueTransformer.fieldChangelog(changelog, 'Key')) {
      keyChangelog.push([change.from, change.changed]);
    }

    const statusChangelog = this.statusChangelog(
      changelog,
      item.fields.status?.name,
      created
    );

    // Timestamp of most recent status change
    let statusChanged: Date | undefined;
    if (statusChangelog.length) {
      statusChanged = statusChangelog[statusChangelog.length - 1][1];
    }

    const assigneeChangelog = IssueTransformer.assigneeChangelog(
      changelog,
      assignee,
      created
    );

    const sprintInfo = this.sprintHistory(
      item.key,
      changelog,
      this.getIssueSprints(item),
      created,
      item.fields.issuetype?.name
    );

    const creator =
      item.fields.creator?.accountId ||
      item.fields.creator?.key ||
      item.fields.creator?.name;

    return {
      id: item.id,
      key: item.key,
      type: item.fields.issuetype?.name,
      status: {
        category: item.fields.status?.statusCategory?.name,
        detail: item.fields.status?.name,
      },
      priority: item.fields.priority?.name,
      project: item.fields.project?.key,
      labels: item.fields.labels ?? [],
      creator,
      created,
      updated: Utils.toDate(item.fields.updated),
      statusChanged,
      statusChangelog,
      keyChangelog,
      dependencies,
      parent: item.fields.parent?.key
        ? {
            key: item.fields.parent?.key,
            type: item.fields.parent?.fields?.issuetype?.name,
          }
        : undefined,
      subtasks: item.fields.subtasks?.map((t: any) => t.key),
      summary: item.fields.summary,
      description: item.fields.description,
      assignees: assigneeChangelog,
      points: this.getPoints(item) ?? undefined,
      epic: this.getIssueEpic(item),
      sprintInfo,
      additionalFields,
      url: `${this.baseURL.replace(/\/$/, '')}/browse/${item.key}`,
      resolution: item.fields.resolution?.name,
      resolutionDate: Utils.toDate(item.fields.resolutiondate),
      fields: item.fields,
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
  retrieveAdditionalFieldValue(
    name: string,
    jsonValue: any
  ): Record<string, string> {
    const additionalFields = {};

    if (isString(jsonValue)) {
      additionalFields[name] = jsonValue;
      return additionalFields;
    }

    const retrievedValue = this.retrieveFieldValue(jsonValue);
    if (retrievedValue != null) {
      additionalFields[name] = stringifyNonString(retrievedValue);
      return additionalFields;
    }

    if (Array.isArray(jsonValue)) {
      // Truncate the array to the array limit
      const inputArray = jsonValue.slice(0, this.additionalFieldsArrayLimit);

      const resultArray = inputArray.map((item, index) => {
        const val = this.retrieveFieldValue(item) ?? item;
        // Also explode each item across additional fields
        additionalFields[name + '_' + index] = stringifyNonString(val);
        return val;
      });

      additionalFields[name] = JSON.stringify(resultArray);
      return additionalFields;
    }

    // Nothing could be retrieved
    additionalFields[name] = stringifyNonString(jsonValue);
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
  retrieveFieldValue(jsonValue: any): any | undefined {
    let val;
    if (jsonValue?.value != null) {
      val = jsonValue.value;
    } else if (jsonValue?.name != null) {
      val = jsonValue.name;
    } else if (jsonValue?.displayName != null) {
      val = jsonValue.displayName;
    }
    return val;
  }

  /**
   * Extracts additional fields from the issue object that are not standard fields.
   *
   * @param item The issue object to extract additional fields from
   * @returns    An array of key-value pairs representing the additional fields
   */
  extractAdditionalFields(item: any): [string, string][] {
    const fieldsToIgnore = [
      ...POINTS_FIELD_NAMES,
      DEV_FIELD_NAME,
      EPIC_LINK_FIELD_NAME,
      SPRINT_FIELD_NAME,
    ];
    // Rewrite keys of additional fields to use names instead of ids
    const additionalFields: [string, string][] = [];
    for (const fieldId of this.additionalFieldIds) {
      const name = this.fieldNameById.get(fieldId);
      const value = item.fields[fieldId];
      if (name && fieldsToIgnore.includes(name)) {
        // Skip these custom fields. They're promoted to standard fields
        continue;
      } else if (name && value != null) {
        try {
          const fields = this.retrieveAdditionalFieldValue(name, value);
          for (const [fieldName, fieldValue] of Object.entries(fields)) {
            additionalFields.push([fieldName, fieldValue]);
          }
        } catch (err: any) {
          this.logger?.warn(
            `Failed to extract custom field ${name} on issue ${item.id}. Skipping.`
          );
        }
      }
    }
    return additionalFields;
  }
}

function stringifyNonString(value: any): string {
  return isString(value) ? value : JSON.stringify(value);
}
