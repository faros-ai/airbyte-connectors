import {AirbyteRecord} from 'faros-airbyte-cdk';
import {makeAxiosInstance, Utils} from 'faros-js-client';
import {toLower} from 'lodash';
import * as TestResultsParser from 'test-results-parser';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CircleCICommon, CircleCIConverter} from './common';
import {Artifact, Pipeline} from './models';

export class Pipelines extends CircleCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
    'cicd_BuildStep',
    // TODO: add test results models
  ];

  private readonly axios = makeAxiosInstance({
    maxBodyLength: Infinity, // accept any response size
    maxContentLength: Infinity, // accept any response size
  });
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
    // We only process XML and JSON files, e.g JUnit, TestNG, xUnit, Mocha(json), Cucumber(json)
    if (!artifact?.url.endsWith('.xml') || !artifact?.url.endsWith('.json')) {
      return [];
    }
    // Load CircleCI token from the config if present
    if (this.token === null) {
      this.token = this.circleciConfig(ctx)?.token ?? '';
      if (this.token === '') {
        ctx.logger.warn(
          'CircleCI token is not set in the config. Test results might fail to download.'
        );
      }
    }

    try {
      // Try to download artifact
      const response = await this.axios.get(artifact.url, {
        responseType: 'arraybuffer',
        headers: this.token ? {'Circle-Token': this.token} : undefined,
      });
      const dataBytes = Buffer.from(response.data, 'binary').toString();

      const trp = TestResultsParser as any; // patching issue, have to use any
      // Convert XML to JSON if needed
      const dataJson = artifact?.url.endsWith('.xml')
        ? trp.jsonFromXML(dataBytes)
        : JSON.parse(dataBytes);

      // Trying to parse artifact with first available parser
      for (const parserType of trp.parserTypes()) {
        try {
          const tr = trp.getParser(parserType).getTestResult(dataJson);
          ctx.logger.debug(
            `Parsed ${tr.total} test results from ${artifact.url} with ${parserType} parser`
          );
          return this.convertTestResult(tr);
        } catch (e: any) {
          continue;
        }
      }
    } catch (e: any) {
      const msg = e?.message ?? JSON.stringify(e);
      ctx.logger.debug(`Failed to process ${artifact.url}: ${msg}`);
    }
    return [];
  }

  convertTestResult(tr: any): ReadonlyArray<DestinationRecord> {
    // TODO: implement
    return [];
  }
}
