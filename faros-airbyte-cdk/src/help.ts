import {ok} from 'assert';
import _ from 'lodash';
import {upperFirst} from 'lodash';
import {table} from 'table';
import {Dictionary} from 'ts-essentials';

const INF_ORDER = 1000;

export interface TableRow {
  title: string;
  path: string;
  section: number;
  description?: string;
  required: boolean;
  constValue?: string;
  default?: any;
  examples: ReadonlyArray<any>;
  airbyte_secret?: boolean;
  multiline?: boolean;
  type: string;
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
    type: o.type === 'array' ? `array of ${o.items.type}` : o.type,
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
      ok(children > 0);
      result.push({
        title: curObject.title,
        path: curPath.join('.'),
        section: idx,
        description: `Please configure argument${
          children > 1 ? 's' : ''
        } ${_.range(newIdx, newIdx + children).join()} as needed`,
        required: req,
        type: 'object',
        examples: [],
      });
      const requiredProperties: string[] = curObject.required || [];
      const cmp = (a, b) =>
        (curObject.properties[a]['order'] ?? INF_ORDER) -
        (curObject.properties[b]['order'] ?? INF_ORDER);
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
