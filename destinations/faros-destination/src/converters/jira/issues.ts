import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

interface Dependency {
  readonly key: string;
  readonly blocking: boolean;
}

const dependencyRegex = /((is (?<type>\w+))|tested) by/;

export class JiraIssues extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskProjectRelationship',
    'tms_TaskBoardRelationship',
    'tms_TaskAssignment',
    'tms_TaskDependency',
    'tms_TaskTag',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const issue = record.record.data;
    const source = this.streamName.source;
    const results: DestinationRecord[] = [];

    const dependencies: Dependency[] = [];
    for (const link of issue.fields.issuelinks ?? []) {
      const match = link.type.inward?.match(dependencyRegex);
      const dependency = link.inwardIssue?.key;
      if (match && dependency) {
        const blocking = match.groups.type === 'blocked';
        dependencies.push({key: dependency, blocking});
      }
    }

    results.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        task: {uid: issue.key, source},
        project: {uid: issue.projectKey, source},
      },
    });
    if (!this.useBoardOwnership) {
      results.push({
        model: 'tms_TaskBoardRelationship',
        record: {
          task: {uid: issue.key, source},
          board: {uid: issue.projectKey, source},
        },
      });
    }
    for (const dependency of dependencies) {
      results.push({
        model: 'tms_TaskDependency',
        record: {
          dependentTask: {uid: issue.key, source},
          fulfillingTask: {uid: dependency.key, source},
          blocking: dependency.blocking,
        },
      });
    }
    for (const label of issue.fields.labels) {
      results.push({
        model: 'tms_TaskTag',
        record: {label: {name: label}, task: {uid: issue.key, source}},
      });
    }
    return results;
  }
}
