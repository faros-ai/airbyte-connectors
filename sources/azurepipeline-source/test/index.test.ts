import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import nock from 'nock';

import * as sut from '../src/index';
import {Build} from '../src/models';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.AzurePipelineSource(logger);
  const [pipelinesStream, buildsStream, releasesStream] = source.streams({
    access_token: 'XYZ',
    organization: 'org1',
    projects: ['proj1'],
  });

  const apiUrl = 'https://dev.azure.com/org1';
  const vsrmApiUrl = 'https://vsrm.dev.azure.com/org1';
  const WATERMARK = '2023-03-03T18:18:11.592Z';

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - no access token', async () => {
    expect(
      await source.checkConnection({
        access_token: '',
        organization: 'organization',
        project: 'project',
        cutoff_days: 365,
      } as any)
    ).toMatchSnapshot();
  });

  test('streams - pipelines, use full_refresh sync mode', async () => {
    const pipelinesResource: any[] = readTestResourceFile('pipelines.json');
    const mock = nock(apiUrl)
      .get('/proj1/_apis/pipelines')
      .query({'api-version': '6.0', $top: 100})
      .reply(200, {value: pipelinesResource});

    const pipelineIter = pipelinesStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {project: 'proj1'}
    );

    const pipelines = [];
    for await (const pipeline of pipelineIter) {
      pipelines.push(pipeline);
    }

    mock.done();

    expect(pipelines).toStrictEqual(pipelinesResource);
  });

  test('streams - builds', async () => {
    const buildsResource: Build[] = readTestResourceFile('builds.json');
    const mock = nock(apiUrl)
      .get('/proj1/_apis/build/builds')
      .query({
        'api-version': '6.0',
        $top: 100,
        queryOrder: 'queueTimeAscending',
        minTime: WATERMARK,
      })
      .reply(200, {value: buildsResource});

    for (const build of buildsResource) {
      mock
        .get(`/proj1/_apis/build/builds/${build.id}/artifacts`)
        .query({'api-version': '6.0'})
        .reply(200, {value: build.artifacts});

      mock
        .get(`/proj1/_apis/build/builds/${build.id}/timeline`)
        .query({'api-version': '6.0'})
        .reply(200, {records: build.jobs});
    }

    const buildIter = buildsStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      {project: 'proj1'},
      {lastQueueTime: WATERMARK}
    );

    const builds = [];
    for await (const build of buildIter) {
      builds.push(build);
    }

    mock.done();

    expect(builds).toStrictEqual(buildsResource);
  });

  test('streams - releases', async () => {
    const releasesResource: any[] = readTestResourceFile('releases.json');
    const mock = nock(vsrmApiUrl)
      .get('/proj1/_apis/release/releases')
      .query({
        'api-version': '6.0',
        $top: 100,
        queryOrder: 'ascending',
        minCreatedTime: WATERMARK,
      })
      .reply(200, {value: releasesResource});

    const releaseIter = releasesStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      {project: 'proj1'},
      {lastCreatedOn: WATERMARK}
    );

    const releases = [];
    for await (const release of releaseIter) {
      releases.push(release);
    }

    mock.done();

    expect(releases).toStrictEqual(releasesResource);
  });
});

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}
