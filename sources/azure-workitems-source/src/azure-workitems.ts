import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {
  TreeStructureGroup,
  WorkItemClassificationNode,
  WorkItemExpand,
  WorkItemUpdate,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import * as types from 'faros-airbyte-common/azure-devops';
import {calculateDateRange} from 'faros-airbyte-common/common';
import {Utils} from 'faros-js-client';
import {chunk, flatten} from 'lodash';
import {VError} from 'verror';

const MAX_WIQL_ITEMS = 19999;
const MAX_BATCH_SIZE = 200;

// Curated list of work item types from Azure DevOps
// https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-item-types/list
const WORK_ITEM_TYPES = [
  "'Task'",
  "'User Story'",
  "'Bug'",
  "'Feature'",
  "'Epic'",
  "'Issue'",
  "'Product Backlog Item'",
  "'Requirement'",
  "'Test Case'",
  "'Test Plan'",
  "'Test Suite'",
];

export class AzureWorkitems extends types.AzureDevOps {
  private additionalFieldReferences: Map<string, string>;
  constructor(
    protected readonly client: types.AzureDevOpsClient,
    protected readonly instanceType: 'cloud' | 'server',
    protected readonly cutoffDays: number,
    protected readonly top: number,
    protected readonly logger: AirbyteLogger,
    private readonly additionalFields?: ReadonlyArray<string>
  ) {
    super(client, instanceType, cutoffDays, top, logger);
    this.additionalFields = additionalFields;
  }

  async checkConnection(projects?: ReadonlyArray<string>): Promise<void> {
    try {
      const res = await this.getProjects(projects);
      if (!res.length) {
        const msg = projects?.length
          ? 'No projects found in the organization.'
          : 'Failed to fetch projects in the config.';
        throw new VError(msg);
      }
    } catch (err: any) {
      let errorMessage = 'Please verify your access token is correct. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  async initializeFieldReferences(): Promise<void> {
    if (this.additionalFieldReferences) {
      return;
    }
    const additionalFieldReferences = new Map<string, string>();
    const additionalFields =
      this.additionalFields?.filter(Boolean).map((f) => f.trim()) ?? [];

    if (!additionalFields.length) {
      this.additionalFieldReferences = additionalFieldReferences;
      return;
    }

    const fieldNameReferences = new Map<string, string>();
    const fields = await this.client.wit.getFields();
    for (const field of fields) {
      fieldNameReferences.set(field.name, field.referenceName);
    }

    for (const field of additionalFields) {
      const referenceName = fieldNameReferences.get(field);
      if (referenceName) {
        additionalFieldReferences.set(referenceName, field);
      } else {
        this.logger.warn(`Field ${field} not found, will not be included`);
      }
    }

    this.logger.debug(
      `Additional field references: ${JSON.stringify(
        Object.fromEntries(additionalFieldReferences)
      )}`
    );
    this.additionalFieldReferences = additionalFieldReferences;
  }

  async *getWorkitems(
    project: ProjectReference,
    since: number
  ): AsyncGenerator<types.WorkItemWithRevisions> {
    await this.initializeFieldReferences();
    const stateCategories = await this.getStateCategories(project.id);

    const dateRange = calculateDateRange({
      start_date: Utils.toDate(since)?.toISOString(),
      cutoff_days: this.cutoffDays,
      logger: this.logger.info.bind(this.logger),
    });
    this.logger.debug(
      `Fetching workitems for project ${project.name} from ${dateRange.startDate} to ${dateRange.endDate}`
    );

    // Build epic cache
    const epicStates = stateCategories.get('Epic');
    const epicCache = await this.buildWorkitemToEpicCache(
      project,
      epicStates,
      dateRange.startDate
    );

    // Extract epic IDs we already fetched
    const epicIds = Array.from(new Set(epicCache.values()));

    // Process non-epic work item types only (epics already fetched for cache)
    const nonEpicTypes = WORK_ITEM_TYPES.filter((type) => type !== "'Epic'");
    const promises = nonEpicTypes.map((type) =>
      this.getIdsFromAWorkItemType(project.name, type, dateRange)
    );

    const results = await Promise.all(promises);
    const ids = [...flatten(results), ...epicIds];

    for (const c of chunk(ids, MAX_BATCH_SIZE)) {
      const workitems = await this.client.wit.getWorkItems(
        c,
        undefined,
        undefined,
        WorkItemExpand.All,
        undefined,
        project.id
      );

      for (const item of workitems ?? []) {
        const states = stateCategories.get(item.fields['System.WorkItemType']);
        const stateCategory = this.getStateCategory(
          item.fields['System.State'],
          states
        );

        // Find associated epic
        const epicId = epicCache.get(item.id);

        const additionalFields = this.extractAdditionalFields(item.fields);
        const revisions = await this.getWorkItemRevisions(
          item.id,
          project.id,
          states
        );
        yield {
          ...item,
          fields: {
            ...item.fields,
            Faros: {
              WorkItemStateCategory: stateCategory,
              EpicId: epicId,
            },
          },
          revisions,
          additionalFields,
          project,
        };
      }
    }
  }

  private buildEpicQuery(
    projectName: string,
    inProgressStates: string[],
    proposedStates: string[],
    completedStates: string[],
    cutoffDate: Date
  ): string {
    const quotedProject = `'${projectName}'`;

    // Build state conditions
    const stateConditions: string[] = [];

    if (inProgressStates.length) {
      stateConditions.push(`[System.State] IN (${inProgressStates.join(',')})`);
    }

    if (proposedStates.length) {
      stateConditions.push(`[System.State] IN (${proposedStates.join(',')})`);
    }

    if (completedStates.length) {
      const completedCondition =
        `([System.State] IN (${completedStates.join(',')}) ` +
        `AND [Microsoft.VSTS.Common.ClosedDate] >= '${cutoffDate.toISOString()}')`;
      stateConditions.push(completedCondition);
    }

    const stateClause = stateConditions.length
      ? `AND (${stateConditions.join(' OR ')})`
      : '';

    return [
      'SELECT [System.Id] FROM WorkItems',
      "WHERE [System.WorkItemType] = 'Epic'",
      `AND [System.TeamProject] = ${quotedProject}`,
      stateClause,
      'ORDER BY [System.ChangedDate] DESC',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private async getAllEpics(
    project: ProjectReference,
    epicStates: Map<string, string>,
    cutoffDate: Date
  ): Promise<ReadonlyArray<number>> {
    // Group states by category
    const statesByCategory = new Map<string, string[]>();
    if (epicStates?.size) {
      for (const [state, category] of epicStates.entries()) {
        const states = statesByCategory.get(category) || [];
        states.push(`'${state}'`);
        statesByCategory.set(category, states);
      }
    } else {
      this.logger.warn(
        'No state categories found for Epic work item type in project ' +
          `${project.name}. Fetching all epics.`
      );
    }

    const inProgressStates = statesByCategory.get('InProgress') || [];
    const proposedStates = statesByCategory.get('Proposed') || [];
    const completedStates = statesByCategory.get('Completed') || [];

    const query = this.buildEpicQuery(
      project.name,
      inProgressStates,
      proposedStates,
      completedStates,
      cutoffDate
    );

    this.logger.debug(
      `Fetching epics for project ${project.name} with query: ${query}`
    );

    const result = await this.client.wit.queryByWiql(
      {query},
      undefined,
      true,
      MAX_WIQL_ITEMS
    );

    return result.workItems.map((item) => item.id);
  }

  private async getDescendantsForEpic(
    epicId: number,
    project: ProjectReference
  ): Promise<ReadonlyArray<number>> {
    const query =
      'SELECT [System.Id] FROM workitemLinks' +
      ` WHERE ([Source].[System.Id] = ${epicId})` +
      " AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward')" +
      ' MODE (Recursive)';

    this.logger.debug(
      `Fetching descendants for epic ${epicId} in project ${project.name}`
    );

    const result = await this.client.wit.queryByWiql(
      {query},
      undefined,
      true,
      MAX_WIQL_ITEMS
    );

    return (
      result.workItemRelations?.map((relation) => relation.target.id) || []
    );
  }

  private async buildWorkitemToEpicCache(
    project: ProjectReference,
    epicStates: Map<string, string>,
    cutoffDate: Date
  ): Promise<Map<number, number>> {
    const cache = new Map<number, number>();

    // Get all epics
    const epicIds = await this.getAllEpics(project, epicStates, cutoffDate);
    this.logger.debug(
      `Found ${epicIds.length} epics in project ${project.name}`
    );

    // For each epic, get all its descendants and map them to the epic
    for (const epicId of epicIds) {
      const descendants = await this.getDescendantsForEpic(epicId, project);
      for (const descendantId of descendants) {
        cache.set(descendantId, epicId);
      }
    }

    return cache;
  }

  private async getWorkItemRevisions(
    id: number,
    project: string,
    states: Map<string, string>
  ): Promise<types.WorkItemRevisions> {
    const updates = await this.getWorkItemUpdates(id, project);
    return {
      states: this.getStateRevisions(states, updates),
      assignees: this.getAssigneeRevisions(updates),
      iterations: this.getIterationRevisions(updates),
    };
  }

  private async getWorkItemUpdates(
    id: number,
    project: string
  ): Promise<ReadonlyArray<WorkItemUpdate>> {
    const getUpdatesFn = (
      top: number,
      skipOrToken: string | number
    ): Promise<WorkItemUpdate[]> =>
      this.client.wit.getUpdates(id, top, skipOrToken as number, project);

    const updates = [];
    for await (const update of this.getPaginated(getUpdatesFn)) {
      updates.push(update);
    }
    if (!updates.length) {
      this.logger.warn(
        `Failed to get updates for work item ${id} in project ${project}`
      );
    }
    return updates;
  }

  private getFieldChanges(
    field: string,
    updates: ReadonlyArray<WorkItemUpdate>
  ): {value: any; changedDate: string}[] {
    const changes = [];
    for (const update of updates ?? []) {
      const fields = update.fields;
      if (!fields) {
        continue;
      }
      if (fields[field]?.newValue) {
        changes.push({
          value: fields[field]?.newValue,
          changedDate: fields['System.ChangedDate']?.newValue,
        });
      }
    }
    return changes;
  }

  private getStateRevisions(
    states: Map<string, string>,
    updates: ReadonlyArray<WorkItemUpdate>
  ): ReadonlyArray<types.WorkItemStateRevision> {
    const changes = this.getFieldChanges('System.State', updates);
    return changes.map((change) => ({
      state: this.getStateCategory(change.value, states),
      changedDate: change.changedDate,
    }));
  }

  private getIterationRevisions(
    updates: ReadonlyArray<WorkItemUpdate>
  ): ReadonlyArray<types.WorkItemIterationRevision> {
    const changes = this.getFieldChanges('System.IterationId', updates);
    return changes.map((change, index) => ({
      iteration: change.value,
      addedAt: change.changedDate,
      removedAt:
        index < changes.length - 1 ? changes[index + 1].changedDate : null,
    }));
  }

  private getStateCategory(
    state: string,
    states: Map<string, string>
  ): types.WorkItemState {
    const category = states?.get(state);
    if (!category) {
      this.logger.debug(`Unknown category for state: ${state}`);
    }
    return {
      name: state,
      category,
    };
  }

  private getAssigneeRevisions(
    updates: ReadonlyArray<WorkItemUpdate>
  ): ReadonlyArray<types.WorkItemAssigneeRevision> {
    const changes = this.getFieldChanges('System.AssignedTo', updates);
    return changes.map((change) => ({
      assignee: change.value,
      changedDate: change.changedDate,
    }));
  }

  /**
   * Fetches all work item IDs from a given project and work item type within a specified date range.
   *
   * @param project - The name of the project to fetch work items from.
   * @param workItemsType - The type of work items to fetch.
   * @param dateRange - An object containing start and end dates for the date range.
   * @returns A promise that resolves to an array of work item IDs.
   */
  async getIdsFromAWorkItemType(
    project: string,
    workItemsType: string,
    dateRange: {startDate: Date; endDate: Date}
  ): Promise<ReadonlyArray<number>> {
    // Watermark to ensure when we get the changed date to use for next iteration,
    // we fetch as of the start of the sync incase it gets updated during the sync
    const asOfWatermark = new Date();

    const minChangeAt = dateRange.startDate;
    let maxChangedAt = dateRange.endDate;
    let hasMore = false;
    const workTypeIds = new Set<number>();

    const quotedProject = `'${project}'`;

    do {
      const data = {
        query:
          'Select [System.Id] From WorkItems' +
          ' WHERE [System.WorkItemType] = ' +
          workItemsType +
          ' AND [System.TeamProject] = ' +
          quotedProject +
          ` AND [System.ChangedDate] >= '${minChangeAt.toISOString()}'` +
          ` AND [System.ChangedDate] <= '${maxChangedAt.toISOString()}'` +
          ' ORDER BY [System.ChangedDate] DESC',
      };
      // Azure API has a limit of 20000 items per request.
      const result = await this.client.wit.queryByWiql(
        data,
        undefined,
        true, // time precision to get timestamp and not date
        MAX_WIQL_ITEMS // max items allowed
      );
      result.workItems.forEach((workItem) => workTypeIds.add(workItem.id));

      if (result.workItems.length === MAX_WIQL_ITEMS) {
        const lastItem = result.workItems.at(-1);
        const lastItemDetails = await this.client.wit.getWorkItem(
          lastItem.id,
          ['System.ChangedDate'],
          asOfWatermark,
          undefined,
          project
        );
        maxChangedAt = Utils.toDate(
          lastItemDetails.fields['System.ChangedDate']
        );

        hasMore = maxChangedAt !== null;
        if (!hasMore) {
          this.logger.warn(
            `Fetching workitems for project: ${project}, workType: ` +
              `${workItemsType} has more than ${MAX_WIQL_ITEMS} items but ` +
              `failed to get next page 'System.ChangedDate' from workitem ` +
              `id: ${lastItem.id}`
          );
        }
      } else {
        hasMore = false;
      }
      this.logger.debug(
        hasMore
          ? `Fetching next page of ${MAX_WIQL_ITEMS} workitems for project ` +
              `${quotedProject} workType ${workItemsType} from ${minChangeAt} ` +
              `until ${maxChangedAt}`
          : `No more workitems for ${quotedProject}, workType: ${workItemsType}`
      );
    } while (hasMore);
    this.logger.debug(
      `Total workitems fetched for project ${quotedProject} workType ` +
        `${workItemsType}: ${workTypeIds.size}`
    );
    return Array.from(workTypeIds);
  }

  /**
   * Retrieves all iterations for a given project in Azure DevOps using
   * the Classification Nodes API to get the iteration hierarchy recursively.
   *
   * We use the Classification Nodes API instead of the Teams/Iterations API because:
   * - Classification Nodes API returns ALL iterations defined in the project
   * - Teams/Iterations API only returns iterations explicitly assigned to specific teams
   * - Classification Nodes API provides the complete iteration hierarchy structure
   * - No team context is required, making it more comprehensive for data extraction
   *
   * Note: The Classification Nodes API doesn't include the calculated 'timeFrame'
   * attribute (past/current/future), but this is calculated in the converter based
   * on the iteration's startDate and finishDate compared to the current date.
   */
  async *getIterations(
    projectId: string
  ): AsyncGenerator<WorkItemClassificationNode> {
    const iteration = await this.client.wit.getClassificationNode(
      projectId,
      TreeStructureGroup.Iterations,
      undefined, // path
      1 // depth
    );

    if (!iteration) {
      return;
    }

    // Yield root iteration
    yield {
      id: iteration.id,
      identifier: iteration.identifier,
      name: iteration.name,
      path: iteration.path,
      attributes: iteration.attributes,
      hasChildren: iteration.hasChildren,
      url: iteration.url,
    };

    // Process children recursively
    yield* this.processIterationChildren(projectId, iteration);
  }

  private async *processIterationChildren(
    projectId: string,
    node: WorkItemClassificationNode
  ): AsyncGenerator<WorkItemClassificationNode> {
    if (!node.children) {
      return;
    }

    for (const child of node.children) {
      yield child;

      if (child.hasChildren) {
        const iteration = await this.client.wit.getClassificationNodes(
          projectId,
          [child.id],
          1
        );
        if (iteration?.length) {
          // This should only have one iteration
          yield* this.processIterationChildren(projectId, iteration[0]);
        } else {
          this.logger.warn(
            `Failed to fetch iteration for ${child.id} ${child.name} to get children`
          );
        }
      }
    }
  }

  private async getStateCategories(
    project: string
  ): Promise<Map<string, Map<string, string>>> {
    const stateCategories = new Map<string, Map<string, string>>();

    await Promise.all(
      WORK_ITEM_TYPES.map(async (type) => {
        const cleanType = type.replace(/'/g, '');
        const states = await this.client.wit.getWorkItemTypeStates(
          project,
          cleanType
        );
        const typeCategories = new Map<string, string>();
        for (const state of states) {
          typeCategories.set(state.name, state.category);
        }
        stateCategories.set(cleanType, typeCategories);
      })
    );

    const stateCategoriesObj = Object.fromEntries(
      Array.from(stateCategories.entries()).map(([type, states]) => [
        type,
        Object.fromEntries(states),
      ])
    );
    this.logger.debug(
      `State categories: ${JSON.stringify(stateCategoriesObj)}`
    );

    return stateCategories;
  }

  private extractAdditionalFields(fields?: {
    [key: string]: any;
  }): ReadonlyArray<types.AdditionalField> {
    const additionalFields = [];
    if (!fields) {
      return additionalFields;
    }

    for (const [key, value] of this.additionalFieldReferences) {
      if (fields[key]) {
        additionalFields.push({name: value, value: fields[key]});
      }
    }
    return additionalFields;
  }
}
