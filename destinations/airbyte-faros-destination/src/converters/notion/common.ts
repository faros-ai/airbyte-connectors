import {AirbyteRecord} from 'faros-airbyte-cdk';
import {z} from 'zod';

import {Converter, StreamContext} from '../converter';

// Zod shorthand validators for common validation
const nonemptyString = z.string().min(1);
const nonemptyStringArray = z.array(nonemptyString).min(1);
function defaultString(val: string): z.ZodDefault<z.ZodString> {
  return z.string().default(val);
}

// Default task type mappings
const defaultTaskType = ['Task'];
const defaultStoryType = ['Story'];
const defaultBugType = ['Bug'];

/** Task type can be a string property or a property and enum mapping */
const taskTypeConfig = z.union([
  defaultString('Type').transform((property) => ({
    property,
    mapping: {
      story: defaultStoryType,
      task: defaultTaskType,
      bug: defaultBugType,
    },
  })),
  z.object({
    property: defaultString('Type'),
    mapping: z.object({
      story: nonemptyStringArray.default(defaultStoryType),
      task: nonemptyStringArray.default(defaultTaskType),
      bug: nonemptyStringArray.default(defaultBugType),
    }),
  }),
]);
export type TaskTypeConfig = z.infer<typeof taskTypeConfig>;

// Default status mappings for sprints
const defaultActive = ['Active'];
const defaultClosed = ['Closed'];
const defaultFuture = ['Future'];

// Default status mappings for tasks and epics
const defaultTodo = ['Not started'];
const defaultInProgress = ['In progress'];
const defaultDone = ['Done'];

/** Common validation for enum mappings, e.g., task status and type */
function refineEnumMapping(
  mapping: Record<string, string[]>,
  ctx: z.RefinementCtx
): void {
  const values = Object.values(mapping).flat();
  if (new Set(values).size !== values.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enum mappings must have disjoint values',
    });
  }
}

/** Status type can be a string property or a property and enum mapping */
const statusConfig = z
  .union([
    nonemptyString.transform((property) => ({
      property,
      mapping: {
        todo: defaultTodo,
        in_progress: defaultInProgress,
        done: defaultDone,
      },
    })),
    z.object({
      property: defaultString('Status'),
      mapping: z
        .object({
          todo: nonemptyStringArray.default(defaultTodo),
          in_progress: nonemptyStringArray.default(defaultInProgress),
          done: nonemptyStringArray.default(defaultDone),
        })
        .superRefine(refineEnumMapping),
    }),
  ])
  .default('Status');
export type StatusConfig = z.infer<typeof statusConfig>;

/** The root config object for the Notion source */
export const notionConfig = z
  .object({
    kind_property: nonemptyString,
    projects: z.object({
      kind: nonemptyString,
      properties: z
        .object({
          name: defaultString('Name'),
          description: defaultString('Description'),
        })
        .default({}),
    }),
    epics: z.object({
      kind: nonemptyString,
      properties: z
        .object({
          name: defaultString('Name'),
          description: defaultString('Description'),
          project: defaultString('Project'),
          status: statusConfig,
        })
        .default({}),
    }),
    sprints: z.object({
      kind: nonemptyString,
      properties: z
        .object({
          name: defaultString('Name'),
          description: defaultString('Description'),
          status: z
            .union([
              nonemptyString.transform((property) => ({
                property,
                mapping: {
                  active: defaultActive,
                  closed: defaultClosed,
                  future: defaultFuture,
                },
              })),
              z.object({
                property: defaultString('Status'),
                mapping: z
                  .object({
                    active: nonemptyStringArray.default(defaultActive),
                    closed: nonemptyStringArray.default(defaultClosed),
                    future: nonemptyStringArray.default(defaultFuture),
                  })
                  .superRefine(refineEnumMapping),
              }),
            ])
            .default('Status'),
          started_at: defaultString('Started At'),
          ended_at: defaultString('Ended At'),
          closed_at: defaultString('Closed At'),
        })
        .default({}),
    }),
    tasks: z.object({
      kind: nonemptyString,
      include_additional_properties: z.boolean().default(false),
      properties: z
        .object({
          name: defaultString('Name'),
          description: defaultString('Description'),
          type: z
            .union([
              nonemptyString.transform((property) => ({
                property,
                mapping: {
                  story: defaultStoryType,
                  task: defaultTaskType,
                  bug: defaultBugType,
                },
              })),
              z.object({
                property: defaultString('Type'),
                mapping: z
                  .object({
                    story: nonemptyStringArray.default(defaultStoryType),
                    task: nonemptyStringArray.default(defaultTaskType),
                    bug: nonemptyStringArray.default(defaultBugType),
                  })
                  .superRefine(refineEnumMapping),
              }),
            ])
            .default('Type'),
          project: defaultString('Project'),
          epic: defaultString('Epic'),
          sprint: defaultString('Sprint'),
          status: statusConfig,
          priority: defaultString('Priority'),
          points: defaultString('Points'),
          assignee: defaultString('Assignee'),
          resolved_at: defaultString('Resolved At'),
        })
        .default({}),
    }),
  })
  .superRefine((cfg, ctx) => {
    const kinds = [
      cfg.projects.kind,
      cfg.epics.kind,
      cfg.sprints.kind,
      cfg.tasks.kind,
    ];
    if (new Set(kinds).size !== kinds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A unique kind must be provided for each TMS object type, ' +
          'i.e., projects, epics, sprints, and tasks.',
      });
    }
  });
export type NotionConfig = z.infer<typeof notionConfig>;

export abstract class NotionConverter extends Converter {
  readonly source = 'Notion';
  private cfg: NotionConfig;

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected notionConfig(ctx: StreamContext): NotionConfig {
    if (!this.cfg) {
      this.cfg = notionConfig.parse(ctx.config.source_specific_configs.notion);
    }
    return this.cfg;
  }
}
