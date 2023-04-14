import {ok} from 'assert';
import _ from 'lodash';
import {upperFirst} from 'lodash';
import {table} from 'table';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {
  runBooleanPrompt,
  runNumberPrompt,
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
}

function visitLeaf(
  o: Dictionary<any>,
  curPath: string[],
  section: number,
  required = false
): TableRow {
  const title =
    o.title || curPath.slice(-1)[0].split('_').map(upperFirst).join(' ');
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
  };

  return leaf;
}

export function traverseObject(
  startObject: Dictionary<any>,
  startPath: string[],
  section = 1,
  required = false
): TableRow[] {
  const result: TableRow[] = [];
  // Queue of objects to process in BFS
  const process: [[Dictionary<any>, string[], number, boolean]] = [
    [startObject, startPath, section, required],
  ];
  let newIdx = section + 1;
  while (process.length > 0) {
    const [curObject, curPath, idx, req] = process.shift();
    if (curObject['type'] !== 'object') {
      result.push(visitLeaf(curObject, curPath, idx, req));
      continue;
    }

    ok(curObject.properties || curObject.oneOf);
    ok(curObject.properties === undefined || curObject.oneOf === undefined);
    ok(curObject.title);

    if (curObject.properties) {
      const children = Object.keys(curObject.properties).length;
      if (!children) {
        result.push({
          title: curObject.title,
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
        title: curObject.title,
        path: curPath.join('.'),
        section: idx,
        children: _.range(newIdx, newIdx + children),
        oneOf: false,
        description: `Please configure argument${
          children > 1 ? 's' : ''
        } ${_.range(newIdx, newIdx + children).join()} as needed`,
        required: req,
        type: 'object',
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
        process.push([
          curObject.properties[propertyName],
          curPath.concat(propertyName),
          newIdx++,
          requiredProperties.includes(propertyName),
        ]);
      }
    } else {
      const children = curObject.oneOf.length;
      ok(children > 0);
      result.push({
        title: curObject.title,
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

async function promptOneOf(row: TableRow, sections: Map<number, TableRow>) {
  const choices = [];
  if (!row.required) {
    choices.push({
      message: 'Skip this section',
      value: 'Skipped.',
    });
  }
  for (const child of row.children) {
    choices.push({message: sections.get(child).title, value: child});
  }
  const choice = await runSelect({
    name: 'oneOf',
    message: row.title,
    choices,
  });

  if (choice === 'Skipped.') {
    return undefined;
  }

  return +choice;
}

async function promptValue(row: TableRow) {
  const type = row.items_type ?? row.type;
  ok(type);

  const message = row.description
    ? `${row.title}: ${row.description}`
    : row.title;

  switch (type) {
    case 'boolean':
      return await runBooleanPrompt({message});
    case 'integer':
      return await runNumberPrompt({message});
    case 'string':
      return await runStringPrompt({message});
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
      return +choice;
    case 'string':
      return choice;
  }

  throw new VError(`Unexpected type: ${type}`);
}

function formatArg(row: TableRow, choice: boolean | number | string) {
  let formattedChoice = typeof choice === 'string' ? `"${choice}"` : choice;
  if (row.type === 'array') {
    formattedChoice = `'[${formattedChoice}]'`;
  }
  return `${row.path} ${formattedChoice}`;
}

async function promptLeaf(row: TableRow) {
  if (row.type === 'empty_object') {
    return undefined;
  }
  const choices = [];
  if (row.constValue !== undefined) {
    return row.constValue;
  }
  if (!row.required) {
    choices.push({
      message: 'Skip this section',
      value: 'Skipped.',
    });
  }
  if (row.default !== undefined) {
    choices.push({
      message: `Use default (${row.default})`,
      value: 'Used default.',
    });
  }
  if (row.examples?.length) {
    let idx = 0;
    for (const example of row.examples) {
      idx++;
      choices.push({message: `example ${idx} (${example})`, value: example});
    }
  }

  let choice = ' ';
  if (choices.length) {
    choices.push({
      message: 'Enter your own value',
      value: ' ',
    });
    const message = row.description
      ? `${row.title}: ${row.description}`
      : row.title;
    choice = await runSelect({
      name: 'leaf',
      message,
      choices,
    });
  }

  switch (choice) {
    case 'Skipped.':
      return undefined;
    case 'Used default.':
      return row.default;
    case ' ':
      return await promptValue(row);
    default:
      return choiceAsType(row, choice);
  }
}

export async function buildJson(
  rows: ReadonlyArray<TableRow>
): Promise<string> {
  const result = {};

  await acceptUserInput(rows, (row, choice) =>
    _.set(result, row.path, row.type === 'array' ? [choice] : choice)
  );

  return JSON.stringify(result);
}

export async function buildArgs(
  rows: ReadonlyArray<TableRow>
): Promise<string> {
  const result = [];

  await acceptUserInput(rows, (row, choice) =>
    result.push(formatArg(row, choice))
  );

  return result.join(' \\\n');
}

async function acceptUserInput(
  rows: ReadonlyArray<TableRow>,
  action: (row: TableRow, choice: any) => void
): Promise<void> {
  const sections: Map<number, TableRow> = new Map(
    rows.map((row) => [row.section, row])
  );

  // Stack of sections to process in DFS
  const process = [0];
  const processed = [];
  while (process.length) {
    const section = process.pop();
    processed.push(section);
    const row = sections.get(section);
    if (row.children?.length) {
      if (row.oneOf) {
        const choice = await promptOneOf(row, sections);
        if (choice) {
          process.push(choice);
        }
      } else {
        for (let idx = row.children.length - 1; idx >= 0; idx--) {
          process.push(row.children[idx]);
        }
      }
    } else {
      const choice = await promptLeaf(row);
      if (choice !== undefined) {
        action(row, choice);
      }
    }
  }
}
