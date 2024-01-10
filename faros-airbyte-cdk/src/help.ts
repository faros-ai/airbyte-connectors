import {ok} from 'assert';
import _ from 'lodash';
import {upperFirst} from 'lodash';
import {table} from 'table';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {
  ChoiceType,
  runBooleanPrompt,
  runNumberPrompt,
  runPassword,
  runSelect,
  runStringPrompt,
} from './prompts';

export interface TableRow {
  title: string;
  path: string;
  section: number;
  children?: ReadonlyArray<number>;
  oneOf?: boolean;
  description?: string;
  required: boolean;
  constValue?: string;
  default?: any;
  examples: ReadonlyArray<any>;
  airbyte_secret?: boolean;
  multiline?: boolean;
  type: string;
  items_type?: string;
  enum?: ReadonlyArray<string>;
}

function convertPathToTitle(path: string[]): string {
  return path.slice(-1)[0].split('_').map(upperFirst).join(' ');
}

function visitLeaf(
  o: Dictionary<any>,
  curPath: string[],
  section: number,
  required = false
): TableRow {
  const title = o.title || convertPathToTitle(curPath);
  const leaf = {
    title,
    path: curPath.join('.'),
    section,
    required,
    description: o.description,
    airbyte_secret: o.airbyte_secret,
    default: o.default,
    constValue: o.const,
    multiline: o.multiline,
    examples: o.examples,
    type: o.type,
    items_type: o.items?.type,
    enum: o.enum,
  };

  return leaf;
}

export function traverseObject(
  startObject: Dictionary<any>,
  startPath: string[],
  section = 1,
  useDeprecatedFields = false,
  useHiddenFields = false
): TableRow[] {
  function shouldInclude(property: Dictionary<any>) {
    return (
      (useDeprecatedFields || !property['deprecated']) &&
      (useHiddenFields || !property['airbyte_hidden'])
    );
  }

  const result: TableRow[] = [];
  // Queue of objects to process in BFS
  const process: [[Dictionary<any>, string[], number, boolean]] = [
    [startObject, startPath, section, false],
  ];
  let newIdx = section + 1;
  while (process.length > 0) {
    const shifted = process.shift();
    let [curObject] = shifted;
    const [, curPath, idx, req] = shifted;
    const isArrayOfObjects =
      curObject['type'] === 'array' && curObject['items']['type'] === 'object';
    if (isArrayOfObjects) {
      curObject = curObject['items'];
    }
    if (curObject['type'] !== 'object') {
      result.push(visitLeaf(curObject, curPath, idx, req));
      continue;
    }

    ok(curObject.properties || curObject.oneOf);
    ok(curObject.properties === undefined || curObject.oneOf === undefined);

    if (curObject.properties) {
      const children = Object.values(curObject.properties).filter(
        shouldInclude
      ).length;
      if (!children) {
        result.push({
          title: curObject.title || convertPathToTitle(curPath),
          path: curPath.join('.'),
          section: idx,
          description: 'Skip this section',
          required: false,
          type: 'empty_object',
          examples: [],
        });
        continue;
      }
      result.push({
        title: curObject.title || convertPathToTitle(curPath),
        path: curPath.join('.'),
        section: idx,
        children: _.range(newIdx, newIdx + children),
        oneOf: false,
        description: `Please configure argument${
          children > 1 ? 's' : ''
        } ${_.range(newIdx, newIdx + children).join()} as needed`,
        required: req,
        type: isArrayOfObjects ? 'array' : 'object',
        items_type: isArrayOfObjects ? 'object' : undefined,
        examples: [],
      });
      const requiredProperties: string[] = curObject.required || [];
      const cmp = function compareFn(a: string, b: string): number {
        const aOrder = curObject.properties[a]['order'];
        const bOrder = curObject.properties[b]['order'];
        // Properties with 'order' should appear before than
        // those without.
        if (aOrder !== undefined && bOrder === undefined) return -1;
        if (aOrder === undefined && bOrder !== undefined) return 1;
        // At this point they're both undefined or both
        // with order. Only return if they are not tied.
        if (aOrder !== bOrder) return aOrder - bOrder;
        // Break the tie by comparing the property names.
        return a.localeCompare(b);
      };
      for (const propertyName of Object.keys(curObject.properties).sort(cmp)) {
        if (!shouldInclude(curObject.properties[propertyName])) {
          continue;
        }

        process.push([
          curObject.properties[propertyName],
          curPath.concat(propertyName),
          newIdx++,
          requiredProperties.includes(propertyName),
        ]);
      }
    } else {
      const children = Object.values(curObject.oneOf).filter(
        shouldInclude
      ).length;

      ok(children > 0);
      result.push({
        title: curObject.title || convertPathToTitle(curPath),
        path: curPath.join('.'),
        section: idx,
        children: _.range(newIdx, newIdx + children),
        oneOf: true,
        description:
          children > 1
            ? `Please select and configure a single argument from ${_.range(
                newIdx,
                newIdx + children
              ).join()}`
            : `Please configure argument ${newIdx}`,
        required: req,
        type: 'object',
        examples: [],
      });
      for (const choice of curObject.oneOf) {
        if (!shouldInclude(choice)) {
          continue;
        }

        process.push([choice, curPath, newIdx++, false]);
      }
    }
  }

  return result;
}

export function helpTable(rows: ReadonlyArray<TableRow>): string {
  const data = [
    [
      'Section ID',
      'Title',
      'Argument',
      'Description',
      'Required',
      'Constant',
      'Default',
      'Examples',
    ],
  ];

  const config = {
    columns: {
      1: {width: 15, wrapWord: true},
      2: {width: 15, wrapWord: true},
      3: {width: 30, wrapWord: true},
      7: {width: 20, wrapWord: true},
    },
  };

  for (const row of rows) {
    data.push([
      row.section,
      row.title,
      row.path,
      row.description || '',
      row.required ? 'Yes' : 'No',
      row.constValue || '',
      row.default ?? '',
      row.examples ? row.examples.join('\n') : '',
    ]);
  }

  return table(data, config);
}

async function promptOneOf(
  row: TableRow,
  sections: Map<number, TableRow>,
  autofill?: boolean
) {
  const choices = [];
  if (!row.required) {
    choices.push({
      message: 'Skip this section',
      value: 'Skipped.',
      type: ChoiceType.SKIP,
    });
  }
  for (const child of row.children) {
    choices.push({
      message: sections.get(child).title,
      value: child,
      type: ChoiceType.ENUM,
    });
  }
  const choice = await runSelect({
    name: 'oneOf',
    message: row.title,
    choices,
    autofill,
  });

  if (choice === 'Skipped.') {
    return undefined;
  }

  return +choice;
}

async function promptValue(row: TableRow, autofill?: boolean) {
  const type = row.items_type ?? row.type;
  ok(type);

  let message = row.description
    ? `${row.title}: ${row.description}`
    : row.title;

  switch (type) {
    case 'boolean':
      return await runBooleanPrompt({message, autofill});
    case 'integer':
      message += ' (integer)';
      return Math.floor(await runNumberPrompt({message, autofill}));
    case 'number':
      message += ' (float)';
      return await runNumberPrompt({message, autofill});
    case 'string':
      if (row.airbyte_secret) {
        return await runPassword({name: 'secret', message, autofill});
      }
      return await runStringPrompt({message, autofill});
  }

  throw new VError(`Unexpected type: ${type}`);
}

function choiceAsType(row: TableRow, choice: string) {
  const type = row.items_type ?? row.type;
  ok(type);

  switch (type) {
    case 'boolean':
      return choice === 'true';
    case 'integer':
    case 'number':
      return +choice;
    case 'string':
      return choice;
  }

  throw new VError(`Unexpected type: ${type}`);
}

function formatArg(
  row: TableRow,
  choice: boolean | number | string | string[]
) {
  let formattedChoice = typeof choice === 'string' ? `"${choice}"` : choice;
  if (row.type === 'array') {
    formattedChoice = `'${JSON.stringify(choice)}'`;
  }
  return `${row.path} ${formattedChoice}`;
}

async function promptLeaf(
  row: TableRow,
  tail = false,
  autofill?: boolean,
  useEnvVars?: boolean
) {
  if (row.type === 'empty_object') {
    return undefined;
  }
  const choices = [];
  if (row.constValue !== undefined) {
    return row.constValue;
  }
  if (!row.required || tail) {
    choices.push({
      // If `tail` is true, this means we're prompting for the second or later element of an array.
      message: tail ? 'Done' : 'Skip this section',
      value: 'Skipped.',
      type: ChoiceType.SKIP,
    });
  }

  const enumChoices = row.enum !== undefined || row.type === 'boolean';

  if (!enumChoices && row.default !== undefined) {
    choices.push({
      message: `Use default (${row.default})`,
      value: 'Used default.',
      type: ChoiceType.DEFAULT,
    });
  }
  if (!enumChoices && row.examples?.length) {
    let idx = 0;
    for (const example of row.examples) {
      idx++;
      choices.push({
        message: `example ${idx} (${example})`,
        value: example,
        type: ChoiceType.EXAMPLE,
      });
    }
  }

  if (useEnvVars && (row.airbyte_secret || row.multiline)) {
    const variableName = row.path
      .split('.')
      .filter((part) => part[0].match(/[a-z]/i))
      .join('_')
      .toUpperCase();
    choices.push({
      message: `Use environment variable ${variableName}`,
      value: `\${${variableName}}`,
      type: ChoiceType.ENVIRONMENT_VARIABLE,
    });
  }

  let choice = ' ';
  if (choices.length) {
    if (enumChoices) {
      for (const choice of row.type === 'boolean' ? [false, true] : row.enum) {
        if (row.default === choice) {
          choices.push({
            message: `${row.default} (default)`,
            value: 'Used default.',
            type: ChoiceType.DEFAULT,
          });
        } else {
          choices.push({
            message: `${choice}`,
            value: `${choice}`,
            type: ChoiceType.ENUM,
          });
        }
      }
    } else {
      choices.push({
        message: 'Enter your own value',
        value: ' ',
        type: ChoiceType.USER_INPUT,
      });
    }
    const message = row.description
      ? `${row.title}: ${row.description}`
      : row.title;
    choice = await runSelect({
      name: 'leaf',
      message,
      choices,
      autofill,
    });
  }

  let result;

  switch (choice) {
    case 'Skipped.':
      return undefined;
    case 'Used default.':
      result = row.default;
      break;
    case ' ':
      result = await promptValue(row, autofill);
      break;
    default:
      result = choiceAsType(row, choice);
  }

  if (row.type === 'array') {
    const nextResult = await promptLeaf(row, true, autofill, useEnvVars);
    return nextResult === undefined ? [result] : [result].concat(nextResult);
  } else {
    return result;
  }
}

export async function buildJson(
  rows: ReadonlyArray<TableRow>,
  autofill?: boolean
): Promise<string> {
  const result = {};

  await acceptUserInput(
    rows,
    (row, choice) => _.set(result, row.path, choice),
    autofill,
    false
  );

  return JSON.stringify(result, null, 2);
}

export async function buildArgs(
  rows: ReadonlyArray<TableRow>,
  autofill?: boolean
): Promise<string> {
  const result = [];

  await acceptUserInput(
    rows,
    (row, choice) => result.push(formatArg(row, choice)),
    autofill,
    true
  );

  return result.join(' \\\n');
}

async function acceptUserInput(
  rows: ReadonlyArray<TableRow>,
  action: (row: TableRow, choice: any) => void,
  autofill?: boolean,
  useEnvVars?: boolean
): Promise<void> {
  const sections: Map<number, TableRow> = new Map(
    rows.map((row) => [row.section, row])
  );

  // Stack of sections to process in DFS
  const process = [rows[0].section];
  const processed = [];
  while (process.length) {
    const section = process.pop();
    processed.push(section);
    const row = sections.get(section);
    if (row.children?.length) {
      if (row.oneOf) {
        const choice = await promptOneOf(row, sections, autofill);
        if (choice) {
          process.push(choice);
        }
      } else if (row.type === 'array' && row.items_type === 'object') {
        const results = [];
        let tail = false,
          done = false;
        while (!done) {
          const choices = [];
          if (!row.required || tail) {
            choices.push({
              // If `tail` is true, this means we're prompting for the second or later element of an array.
              message: tail ? 'Done' : 'Skip this section',
              value: 'Skipped.',
              type: ChoiceType.SKIP,
            });
          }
          choices.push({
            message: 'Enter your own value',
            value: ' ',
            type: ChoiceType.USER_INPUT,
          });
          const choice = await runSelect({
            name: 'array',
            message: row.title,
            choices,
            autofill,
          });
          switch (choice) {
            case 'Skipped.':
              done = true;
              break;
            case ' ': {
              const result = {};
              for (const child of row.children) {
                await acceptUserInput(
                  [sections.get(child)],
                  (row, choice) =>
                    _.set(result, row.path.split('.').slice(-1), choice),
                  autofill,
                  useEnvVars
                );
              }
              results.push(result);
              tail = true;
            }
          }
        }
        if (results.length) {
          action(row, results);
        }
      } else {
        for (let idx = row.children.length - 1; idx >= 0; idx--) {
          process.push(row.children[idx]);
        }
      }
    } else {
      const choice = await promptLeaf(row, false, autofill, useEnvVars);
      if (choice !== undefined) {
        action(row, choice);
      }
    }
  }
}
