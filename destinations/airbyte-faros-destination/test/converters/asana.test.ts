import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';

import {StreamContext} from '../../src';
import {ProjectTasks} from '../../src/converters/asana/project_tasks';
import {Projects} from '../../src/converters/asana/projects';
import {Tags} from '../../src/converters/asana/tags';
import {Tasks} from '../../src/converters/asana/tasks';
import {Users} from '../../src/converters/asana/users';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {asanaAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('asana', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/asana/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__asana__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(asanaAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      projects: 1,
      tags: 2,
      tasks: 3,
      users: 1,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      tms_Label: 2,
      tms_Project: 1,
      tms_Task: 3,
      tms_TaskBoard: 1,
      tms_TaskBoardProjectRelationship: 1,
      tms_TaskTag: 2,
      tms_User: 1,
    };

    await assertProcessedAndWrittenModels(
      processedByStream,
      writtenByModel,
      stdout,
      processed,
      cli
    );
  });

  describe('tasks', () => {
    const converter = new Tasks();
    const TASK = {
      gid: '1205346703408262',
      created_at: '2023-08-24T15:52:00.014Z',
      completed_at: '2023-08-25T15:52:00.014Z',
      custom_fields: [],
      dependencies: [],
      dependents: [],
      due_at: null,
      due_on: '2023-08-31',
      followers: [
        {
          gid: '7440298482110',
        },
      ],
      hearted: false,
      hearts: [],
      html_notes: '<body></body>',
      is_rendered_as_separator: false,
      liked: false,
      likes: [],
      modified_at: '2023-08-25T20:59:25.575Z',
      name: 'Task 1',
      notes: 'Task 1 notes',
      num_hearts: 0,
      num_likes: 0,
      num_subtasks: 0,
      parent: null,
      permalink_url:
        'https://app.asana.com/0/1205346703408259/1205346703408262',
      projects: [
        {
          gid: '1205346703408259',
        },
      ],
      resource_type: 'task',
      start_on: null,
      resource_subtype: 'default_task',
      workspace: {
        gid: '1205346833089989',
      },
    };

    test('basic task', async () => {
      const record = AirbyteRecord.make('tasks', TASK);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('completed task converts to status Done', async () => {
      const record = AirbyteRecord.make('tasks', {
        ...TASK,
        completed: true,
        completed_at: '2023-08-25T20:59:25.481Z',
        completed_by: {
          gid: '7440298482110',
        },
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('assignee', async () => {
      const record = AirbyteRecord.make('tasks', {
        ...TASK,
        assignee: {
          gid: '7440298482110',
        },
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('parent', async () => {
      const record = AirbyteRecord.make('tasks', {
        ...TASK,
        parent: {
          gid: '1205346703408261',
        },
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('memberships', async () => {
      const record = AirbyteRecord.make('tasks', {
        ...TASK,
        memberships: [
          {
            project: {
              gid: '1205346703408259',
            },
            section: {
              gid: '1205346703408260',
              name: 'Section 1',
            },
          },
        ],
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('task with stories writes statusChangelog', async () => {
      const record = AirbyteRecord.make('tasks', {
        ...TASK,
        stories: [
          {
            gid: '1205346703408261',
            created_at: '2023-08-24T15:52:00.014Z',
            created_by: {
              gid: '7440298482110',
            },
            resource_subtype: 'marked_complete',
            resource_type: 'story',
            text: 'Story 2',
          },
          {
            gid: '1205346703408261',
            created_at: '2023-08-24T15:55:00.014Z',
            created_by: {
              gid: '7440298482110',
            },
            resource_subtype: 'marked_incomplete',
            resource_type: 'story',
            text: 'Story 2',
          },
        ],
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('tags', async () => {
      const record = AirbyteRecord.make('tasks', {
        ...TASK,
        tags: [{gid: '1205346703408260'}, {gid: '1205346703408261'}],
      });
      const ctx = new StreamContext(
        new AirbyteLogger(),
        {edition_configs: {}},
        {}
      );
      ctx.set(
        Tasks.tagsStream.asString,
        '1205346703408260',
        AirbyteRecord.make('tags', {name: 'tag1'})
      );
      ctx.set(
        Tasks.tagsStream.asString,
        '1205346703408261',
        AirbyteRecord.make('tags', {name: 'tag2'})
      );
      const res = await converter.convert(record, ctx);
      expect(res).toMatchSnapshot();
    });
  });

  describe('projects', () => {
    const converter = new Projects();
    const PROJECT = {
      gid: '1205346703408259',
      created_at: '2023-08-24T15:51:52.758Z',
      modified_at: '2023-08-24T15:51:52.758Z',
      name: 'Project Uno',
      notes: 'Project Uno notes',
      workspace: {
        gid: '1205346833089989',
      },
    };

    test('basic project', async () => {
      const record = AirbyteRecord.make('projects', PROJECT);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });

  describe('tags', () => {
    const converter = new Tags();
    const TAG = {
      gid: 'tag-123',
      name: 'SampleTag',
    };

    test('basic tag', async () => {
      const record = AirbyteRecord.make('tags', TAG);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });

  describe('users', () => {
    const converter = new Users();
    const USER = {
      gid: 'user-123',
      name: 'John Doe',
    };

    test('basic user', async () => {
      const record = AirbyteRecord.make('users', USER);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('user with email', async () => {
      const record = AirbyteRecord.make('users', {
        ...USER,
        email: 'johndoe@example.com',
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });

  describe('project tasks', () => {
    const converter = new ProjectTasks();
    const PROJECT_TASK = {
      project_gid: '1205346703408259',
      task_gid: '1205346703408262',
    };
    test('basic project task', async () => {
      const record = AirbyteRecord.make('project_tasks', PROJECT_TASK);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });
});
