import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import _ from 'lodash';
import {Dictionary} from 'ts-essentials';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {NotionConverter, StatusConfig, TaskTypeConfig} from './common';

interface PageConfig {
  readonly kindExtractor: Extractor<string>;
  readonly projects: {
    readonly kind: string;
    readonly extractors: {
      readonly name: Extractor<string>;
      readonly description: Extractor<string>;
    };
  };
  readonly epics: {
    readonly kind: string;
    readonly extractors: {
      readonly name: Extractor<string>;
      readonly description: Extractor<string>;
      readonly project: Extractor<string>;
      readonly status: Extractor<EpicStatus>;
    };
  };
  readonly sprints: {
    readonly kind: string;
    readonly extractors: {
      readonly name: Extractor<string>;
      readonly description: Extractor<string>;
      readonly status: Extractor<SprintStatus>;
      readonly startedAt: Extractor<Date>;
      readonly endedAt: Extractor<Date>;
      readonly closedAt: Extractor<Date>;
    };
  };
  readonly tasks: {
    readonly kind: string;
    readonly extractors: {
      readonly name: Extractor<string>;
      readonly description: Extractor<string>;
      readonly type: Extractor<TaskType>;
      readonly project: Extractor<string>;
      readonly epic: Extractor<string>;
      readonly sprint: Extractor<string>;
      readonly status: Extractor<TaskStatus>;
      readonly priority: Extractor<string>;
      readonly points: Extractor<number>;
      readonly assignee: Extractor<string[]>;
      readonly resolvedAt: Extractor<Date>;
      readonly additionalProperties: Extractor<Map<string, string>>;
    };
  };
}

interface TaskType {
  readonly category: 'Bug' | 'Custom' | 'Story' | 'Task';
  readonly detail: string;
}

interface TaskStatus {
  readonly category: 'Custom' | 'Done' | 'InProgress' | 'Todo';
  readonly detail: string;
}
type EpicStatus = TaskStatus;
type SprintStatus = 'Active' | 'Closed' | 'Future';

/** Type for TMS model -> model references. See Pages.ref(string). */
interface Reference {
  readonly uid: string;
  readonly source: string;
}

type Page = Dictionary<any>;
/** Extracts a property from a page */
type Extractor<T> = (page: Page) => T | undefined;
/** Property extractors for each TMS type */
type ProjectExtractor = PageConfig['projects']['extractors'];
type EpicExtractor = PageConfig['epics']['extractors'];
type SprintExtractor = PageConfig['sprints']['extractors'];
type TaskExtractor = PageConfig['tasks']['extractors'];

/** Applies a function to the value of a property */
function withProperty<T>(name: string, fn: (val: any) => T): Extractor<T> {
  return (page: Page) => {
    const properties = page?.properties;
    if (Array.isArray(properties)) {
      for (const property of properties) {
        if (property?.name === name) {
          return fn(property?.value);
        }
      }
    }
  };
}

function coalesceExtractor<T>(...extractors: Extractor<T>[]): Extractor<T> {
  return (page: Page) => {
    for (const extractor of extractors) {
      const val = extractor(page);
      if (!_.isNil(val)) {
        return val;
      }
    }
  };
}

function mapExtractor<S, T>(
  extractor: Extractor<S>,
  fn: (s: S) => T
): Extractor<T> {
  return (page: Page) => {
    return fn(extractor(page));
  };
}

function titleExtractor(property: string): Extractor<string> {
  return withProperty(property, (val) => {
    if (val?.type === 'title') {
      const title = val.title?.[0]?.text.content;
      if (_.isString(title)) {
        return title;
      }
    }
  });
}

function textExtractor(property: string): Extractor<string> {
  return withProperty(property, (val) => {
    if (val?.type === 'rich_text') {
      const text = val.rich_text?.[0]?.text?.content;
      if (_.isString(text)) {
        return text;
      }
    }
  });
}

function numberExtractor(property: string): Extractor<number> {
  return withProperty(property, (val) => {
    if (val?.type === 'number') {
      if (_.isFinite(val.number)) {
        return val.number;
      }
    }
  });
}

function dateExtractor(property: string): Extractor<Date> {
  return withProperty(property, (val) => {
    if (val?.type === 'date') {
      if (val.date?.start) {
        // TODO: timezone?
        return Utils.toDate(val.date?.start);
      }
    }
  });
}

function selectExtractor(property: string): Extractor<string> {
  return withProperty(property, (val) => {
    if (val?.type === 'select') {
      const selection = val.select?.name;
      if (_.isString(selection)) {
        return selection;
      }
    }
  });
}

function multiSelectExtractor(property: string): Extractor<string[]> {
  return withProperty(property, (val) => {
    const selected: string[] = [];
    if (val?.type === 'multi_select') {
      if (Array.isArray(val.multi_select)) {
        for (const selection of val.multi_select) {
          if (_.isString(selection.name)) {
            selected.push(selection.name);
          }
        }
      }
    }
    return selected;
  });
}

function peopleExtractor(property: string): Extractor<string[]> {
  return withProperty(property, (val) => {
    const people: string[] = [];
    if (val?.type === 'people') {
      if (Array.isArray(val.people)) {
        for (const person of val.people) {
          if (person?.object === 'user' && _.isString(person.id)) {
            people.push(person.id);
          }
        }
      }
    }
    return people;
  });
}

function relationExtractor(property: string): Extractor<string> {
  return withProperty(property, (val) => {
    if (val?.type === 'relation') {
      if (Array.isArray(val.relation)) {
        for (const relation of val.relation) {
          if (_.isString(relation.id)) {
            // Return the first relation
            return relation.id;
          }
        }
      }
    }
  });
}

function typeExtractor(typeConfig: TaskTypeConfig): Extractor<TaskType> {
  return mapExtractor(selectExtractor(typeConfig.property), (type) => {
    const mapping = typeConfig.mapping;
    if (mapping.bug.includes(type)) {
      return {category: 'Bug', detail: type};
    } else if (mapping.story.includes(type)) {
      return {category: 'Story', detail: type};
    } else if (mapping.task.includes(type)) {
      return {category: 'Task', detail: type};
    }
    return {category: 'Custom', detail: type};
  });
}

function statusExtractor(status: StatusConfig): Extractor<TaskStatus> {
  // Source type can be a select type or the built-in status type:
  // https://www.notion.so/help/guides/status-property-gives-clarity-on-tasks
  const extractor = coalesceExtractor(
    selectExtractor(status.property),
    withProperty(status.property, (val: any) => {
      if (val?.type === 'status') {
        const statusName = val.status?.name;
        if (_.isString(statusName)) {
          return statusName;
        }
      }
    })
  );

  return mapExtractor(extractor, (detail) => {
    if (status.mapping.todo.includes(detail)) {
      return {category: 'Todo', detail};
    } else if (status.mapping.in_progress.includes(detail)) {
      return {category: 'InProgress', detail};
    } else if (status.mapping.done.includes(detail)) {
      return {category: 'Done', detail};
    }
    return {category: 'Custom', detail};
  });
}

/** Extracts unknown properties from a page. Casts values to a string. */
function additionalPropertiesExtractor(
  enabled: boolean,
  exclude: Set<string>
): Extractor<Map<string, string>> {
  return (page) => {
    if (!enabled) {
      return undefined;
    }

    const additionalProperties = new Map<string, string>();
    const properties = page?.properties;
    if (Array.isArray(page?.properties)) {
      for (const property of properties) {
        if (property?.name && !exclude.has(property.name)) {
          const propertyType = property.value?.type;
          let value: string | undefined;
          if (propertyType === 'rich_text') {
            value = textExtractor(property.name)(page);
          } else if (propertyType === 'number') {
            const number = numberExtractor(property.name)(page);
            if (_.isFinite(number)) {
              value = `${number}`;
            }
          } else if (propertyType === 'select') {
            value = selectExtractor(property.name)(page);
          } else if (propertyType === 'multi_select') {
            const selected = multiSelectExtractor(property.name)(page);
            if (selected?.length) {
              value = JSON.stringify(selected);
            }
          } else if (propertyType === 'relation') {
            value = relationExtractor(property.name)(page);
          } else if (propertyType === 'people') {
            const people = peopleExtractor(property.name)(page);
            if (people?.length) {
              value = JSON.stringify(people);
            }
          }
          if (_.isString(value)) {
            additionalProperties.set(property.name, value);
          }
        }
      }
    }
    return additionalProperties;
  };
}

export class Pages extends NotionConverter {
  private pageCfg: PageConfig;
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoardRelationship',
    'tms_TaskProjectRelationship',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
    'tms_Project',
    'tms_Epic',
    'tms_Sprint',
  ];

  private pageConfig(ctx: StreamContext): PageConfig {
    if (this.pageCfg) return this.pageCfg;

    const cfg = this.notionConfig(ctx);
    const {projects, epics, sprints, tasks} = cfg;
    const additionalProperties = new Set<string>();
    for (const propertyValue of Object.values(tasks.properties)) {
      if (_.isString(propertyValue)) {
        additionalProperties.add(propertyValue);
      } else {
        additionalProperties.add(propertyValue.property);
      }
    }

    this.pageCfg = {
      kindExtractor: selectExtractor(cfg.kind_property),
      projects: {
        kind: projects.kind,
        extractors: {
          name: titleExtractor(projects.properties.name),
          description: textExtractor(projects.properties.description),
        },
      },
      epics: {
        kind: epics.kind,
        extractors: {
          name: titleExtractor(epics.properties.name),
          description: textExtractor(epics.properties.description),
          project: selectExtractor(epics.properties.project),
          status: statusExtractor(epics.properties.status),
        },
      },
      sprints: {
        kind: sprints.kind,
        extractors: {
          name: titleExtractor(sprints.properties.name),
          description: textExtractor(sprints.properties.description),
          status: mapExtractor(
            selectExtractor(sprints.properties.status.property),
            (status): SprintStatus => {
              const mapping = sprints.properties.status.mapping;
              if (mapping.active.includes(status)) {
                return 'Active';
              } else if (mapping.closed.includes(status)) {
                return 'Closed';
              } else if (mapping.future.includes(status)) {
                return 'Future';
              }
              return undefined;
            }
          ),
          startedAt: dateExtractor(sprints.properties.started_at),
          endedAt: dateExtractor(sprints.properties.ended_at),
          closedAt: dateExtractor(sprints.properties.closed_at),
        },
      },
      tasks: {
        kind: tasks.kind,
        extractors: {
          name: titleExtractor(tasks.properties.name),
          description: textExtractor(tasks.properties.description),
          type: typeExtractor(tasks.properties.type),
          project: relationExtractor(tasks.properties.project),
          epic: relationExtractor(tasks.properties.epic),
          sprint: relationExtractor(tasks.properties.sprint),
          status: statusExtractor(tasks.properties.status),
          priority: selectExtractor(tasks.properties.priority),
          points: numberExtractor(tasks.properties.points),
          assignee: peopleExtractor(tasks.properties.assignee),
          resolvedAt: dateExtractor(tasks.properties.resolved_at),
          additionalProperties: additionalPropertiesExtractor(
            tasks.include_additional_properties,
            additionalProperties
          ),
        },
      },
    };
    return this.pageCfg;
  }

  private ref(uid?: string): Reference {
    if (_.isString(uid)) {
      return {uid, source: this.streamName.source};
    }
  }

  private convertTask(
    extractor: TaskExtractor,
    page: Page
  ): DestinationRecord[] {
    const additionalProperties = extractor.additionalProperties(page);
    let additionalFields: {name: string; value: string}[];
    if (additionalProperties?.size) {
      additionalFields = [];
      for (const [name, value] of additionalProperties) {
        additionalFields.push({name, value});
      }
    }

    const results: DestinationRecord[] = [];
    results.push({
      model: 'tms_Task',
      record: {
        uid: page.id,
        url: page.url,
        type: extractor.type(page),
        name: extractor.name(page),
        description: extractor.description(page),
        epic: this.ref(extractor.epic(page)),
        sprint: this.ref(extractor.sprint(page)),
        status: extractor.status(page),
        priority: extractor.priority(page),
        points: extractor.points(page),
        creator: this.ref(page.created_by?.id),
        resolvedAt: extractor.resolvedAt(page),
        createdAt: Utils.toDate(page.created_time),
        updatedAt: Utils.toDate(page.last_edited_time),
        additionalFields,
        source: this.streamName.source,
      },
    });

    const project = extractor.project(page);
    if (_.isString(project)) {
      results.push(
        {
          model: 'tms_TaskProjectRelationship',
          record: {
            task: this.ref(page.id),
            project: this.ref(project),
          },
        },
        {
          model: 'tms_TaskBoardRelationship',
          record: {
            task: this.ref(page.id),
            board: this.ref(project),
          },
        }
      );
    }

    const assignees = extractor.assignee(page) ?? [];
    for (const assignee of assignees) {
      results.push({
        model: 'tms_TaskAssignment',
        record: {
          // We don't know when this user was assigned
          task: this.ref(page.id),
          assignee: this.ref(assignee),
        },
      });
    }
    return results;
  }

  private convertEpic(
    extractor: EpicExtractor,
    page: Page
  ): DestinationRecord[] {
    return [
      {
        model: 'tms_Epic',
        record: {
          uid: page.id,
          name: extractor.name(page),
          description: extractor.description(page),
          status: extractor.status(page),
          project: this.ref(extractor.project(page)),
          source: this.streamName.source,
        },
      },
    ];
  }

  private convertSprint(
    extractor: SprintExtractor,
    page: Page
  ): DestinationRecord[] {
    return [
      {
        model: 'tms_Sprint',
        record: {
          uid: page.id,
          name: extractor.name(page),
          description: extractor.description(page),
          state: extractor.status(page),
          startedAt: extractor.startedAt(page),
          endedAt: extractor.endedAt(page),
          source: this.streamName.source,
        },
      },
    ];
  }

  private convertProject(
    extractor: ProjectExtractor,
    page: Page
  ): DestinationRecord[] {
    return [
      {
        model: 'tms_Project',
        record: {
          uid: page.id,
          name: extractor.name(page),
          description: extractor.description(page),
          createdAt: Utils.toDate(page.created_time),
          updatedAt: Utils.toDate(page.last_edited_time),
          source: this.streamName.source,
        },
      },
      {
        model: 'tms_TaskBoard',
        record: {
          uid: page.id,
          name: extractor.name(page),
          source: this.streamName.source,
        },
      },
      {
        model: 'tms_TaskBoardProjectRelationship',
        record: {
          board: this.ref(page.id),
          project: this.ref(extractor.name(page)),
        },
      },
    ];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const pageCfg = this.pageConfig(ctx);
    const page = record.record.data;
    const kind = pageCfg.kindExtractor(page);
    if (kind === pageCfg.projects.kind) {
      return this.convertProject(pageCfg.projects.extractors, page);
    } else if (kind === pageCfg.epics.kind) {
      return this.convertEpic(pageCfg.epics.extractors, page);
    } else if (kind === pageCfg.sprints.kind) {
      return this.convertSprint(pageCfg.sprints.extractors, page);
    } else if (kind === pageCfg.tasks.kind) {
      return this.convertTask(pageCfg.tasks.extractors, page);
    }
    return [];
  }
}
