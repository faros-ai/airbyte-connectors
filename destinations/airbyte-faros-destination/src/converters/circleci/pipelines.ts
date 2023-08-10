import {AirbyteRecord} from 'faros-airbyte-cdk';
import {makeAxiosInstance, Utils} from 'faros-js-client';
import {toLower} from 'lodash';
import {getParser, jsonFromXML, parserTypes} from 'test-results-parser';
import TestResult from 'test-results-parser';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CircleCICommon, CircleCIConverter} from './common';
import {Artifact, Pipeline} from './models';

export class Pipelines extends CircleCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
    'cicd_BuildStep',
  ];

  private readonly axios = makeAxiosInstance();
  private token: string | null = null;

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data as Pipeline;
    const res: DestinationRecord[] = [];

    for (const workflow of pipeline.workflows ?? []) {
      const buildKey = CircleCICommon.getBuildKey(workflow, pipeline, source);
      const repoName = CircleCICommon.getProject(pipeline.project_slug);
      res.push({
        model: 'cicd_Build',
        record: {
          ...buildKey,
          number: pipeline.number,
          name: `${CircleCICommon.getProject(pipeline.project_slug)}_${
            pipeline.number
          }_${workflow.name}`,
          createdAt: Utils.toDate(workflow.created_at),
          startedAt: Utils.toDate(workflow.created_at),
          endedAt: Utils.toDate(workflow.stopped_at),
          status: CircleCICommon.convertStatus(workflow.status),
        },
      });
      res.push({
        model: 'cicd_BuildCommitAssociation',
        record: {
          build: buildKey,
          commit: {
            sha: pipeline.vcs?.revision,
            uid: pipeline.vcs?.revision,
            repository: {
              name: repoName,
              uid: repoName,
              organization: {
                uid: CircleCICommon.getOrganization(pipeline.project_slug),
                source: pipeline.vcs?.provider_name,
              },
            },
          },
        },
      });
      for (const job of workflow.jobs ?? []) {
        res.push({
          model: 'cicd_BuildStep',
          record: {
            uid: toLower(job.id),
            name: job.name,
            startedAt: Utils.toDate(job.started_at),
            endedAt: Utils.toDate(job.stopped_at),
            status: CircleCICommon.convertStatus(job.status),
            type: CircleCICommon.convertJobType(job.type),
            build: buildKey,
          },
        });

        for (const artifact of job.artifacts ?? []) {
          const testResults = await this.collectTestResults(artifact, ctx);
          for (const testRes of testResults ?? []) {
            res.push(testRes);
          }
        }
      }
    }
    return res;
  }

  // Collect test results from CircleCI artifacts
  // See - https://circleci.com/docs/collect-test-data/
  async collectTestResults(
    artifact: Artifact,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (!artifact?.url.endsWith('.xml') || !artifact?.url.endsWith('.json')) {
      return [];
    }
    if (this.token === null) {
      this.token = this.circleciConfig(ctx)?.token ?? '';
      if (this.token === '') {
        ctx.logger.warn(
          'CircleCI token is not set in the config. Test results might fail to download.'
        );
      }
    }

    try {
      const response = await this.axios.get(artifact.url, {
        responseType: 'arraybuffer',
        headers: this.token ? {'Circle-Token': this.token} : undefined,
      });
      const dataBytes = Buffer.from(response.data, 'binary').toString();
      const dataJson = artifact?.url.endsWith('.xml')
        ? jsonFromXML(dataBytes)
        : JSON.parse(dataBytes);

      // Trying to parse with all available parsers
      for (const parserType of parserTypes()) {
        try {
          const tr = getParser(parserType).getTestResult(
            dataJson
          ) as TestResult;
          ctx.logger.debug(
            `Parsed ${tr.total} test results from ${artifact.url} with ${parserType} parser`
          );
          break;
        } catch (e: any) {
          continue;
        }
      }
    } catch (e: any) {
      const error = e?.message ?? JSON.stringify(e);
      ctx.logger.debug(`Failed to parse ${artifact.url}: ${error}`);
    }
    return [];
  }
}
