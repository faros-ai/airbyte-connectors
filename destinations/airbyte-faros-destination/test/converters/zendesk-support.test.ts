import exp from 'constants';
import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';

import {StreamContext} from '../../src/converters/converter';
import {
  TicketFieldsStream,
  TicketMetricsStream,
} from '../../src/converters/zendesk-support/common';
import {Tags} from '../../src/converters/zendesk-support/tags';
import {Tickets} from '../../src/converters/zendesk-support/tickets';
import {Users} from '../../src/converters/zendesk-support/users';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {zendeskSupportAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('zendesk-support', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/zendesk-support/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__zendesk-support__';

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
    cli.stdin.end(zendeskSupportAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      tags: 8,
      ticket_fields: 9,
      ticket_metrics: 14,
      tickets: 14,
      users: 15,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      tms_Label: 8,
      tms_Task: 14,
      tms_TaskAssignment: 14,
      tms_TaskDependency: 1,
      tms_TaskTag: 29,
      tms_User: 15,
    };

    await assertProcessedAndWrittenModels(
      processedByStream,
      writtenByModel,
      stdout,
      processed,
      cli
    );
  });
});

describe('tickets', () => {
  const converter = new Tickets();
  const ctx = new StreamContext(new AirbyteLogger(), {edition_configs: {}}, {});
  const ticket = {
    url: 'https://example.zendesk.com/api/v2/tickets/1.json',
    id: 1,
    external_id: null,
    via: {
      channel: 'sample_ticket',
      source: {from: {}, to: {}, rel: null},
    },
    created_at: '2024-01-24T14:15:15Z',
    updated_at: '2024-01-24T14:15:15Z',
    type: 'incident',
    subject: 'Sample ticket: Meet the ticket',
    raw_subject: 'Sample ticket: Meet the ticket',
    description:
      'Hi there, I’m sending an email because I’m having a problem setting up your new product',
    priority: 'normal',
    status: 'open',
    recipient: null,
    requester_id: 23111599474068,
    submitter_id: 23111595978772,
    assignee_id: null,
    organization_id: null,
    group_id: 23111598987540,
    collaborator_ids: [],
    follower_ids: [],
    email_cc_ids: [],
    forum_topic_id: null,
    problem_id: null,
    has_incidents: false,
    is_public: true,
    due_at: null,
    tags: [],
    custom_fields: [{id: 23111693329300, value: null}],
    satisfaction_rating: null,
    sharing_agreement_ids: [],
    custom_status_id: 23111598975892,
    fields: [{id: 23111693329300, value: null}],
    followup_ids: [],
    ticket_form_id: 23111598732820,
    brand_id: 23111567404180,
    allow_channelback: false,
    allow_attachments: true,
    from_messaging_channel: false,
    generated_timestamp: 1706105716,
  };

  test('ticket', async () => {
    const record = AirbyteRecord.make('ticket', ticket);
    const res = await converter.convert(record, ctx);
    expect(res).toMatchSnapshot();
  });

  test('ticket with tags', async () => {
    const record = AirbyteRecord.make('ticket', {
      ...ticket,
      tags: ['tag1', 'tag2'],
    });
    const res = await converter.convert(record, ctx);
    expect(res).toMatchSnapshot();
  });

  test('ticket with assignee', async () => {
    const record = AirbyteRecord.make('ticket', {
      ...ticket,
      assignee_id: 23123038291476,
    });
    const assigneeCtx = new StreamContext(
      new AirbyteLogger(),
      {edition_configs: {}},
      {}
    );
    assigneeCtx.set(
      TicketMetricsStream.asString,
      'metricId',
      AirbyteRecord.make('ticket_metrics', {
        ticket_id: ticket.id,
        assigned_at: '2024-01-24T14:17:58Z',
      })
    );
    const res = await converter.convert(record, assigneeCtx);
    expect(res).toMatchSnapshot();
  });

  test('ticket is solved', async () => {
    const record = AirbyteRecord.make('ticket', {
      ...ticket,
      status: 'solved',
    });
    const metricCtx = new StreamContext(
      new AirbyteLogger(),
      {edition_configs: {}},
      {}
    );
    metricCtx.set(
      TicketMetricsStream.asString,
      'metricId',
      AirbyteRecord.make('ticket_metrics', {
        ticket_id: ticket.id,
        solved_at: '2024-01-24T20:12:02Z',
      })
    );
    const res = await converter.convert(record, metricCtx);
    expect(res).toMatchSnapshot();
  });

  test('ticket has follow ups', async () => {
    const record = AirbyteRecord.make('ticket', {
      ...ticket,
      followup_ids: [2],
    });
    const res = await converter.convert(record, ctx);
    expect(res).toMatchSnapshot();
  });

  test('ticket with custom status', async () => {
    const record = AirbyteRecord.make('ticket', {
      ...ticket,
      status: 'pending',
      custom_status_id: 23328843804692,
    });
    const fieldCtx = new StreamContext(
      new AirbyteLogger(),
      {edition_configs: {}},
      {}
    );
    fieldCtx.set(
      TicketFieldsStream.asString,
      'ticketFieldId',
      AirbyteRecord.make('ticket_fields', {
        type: 'custom_status',
        custom_statuses: [
          {
            id: 23328843804692,
            status_category: 'pending',
            agent_label: 'Waiting for fix',
            end_user_label: 'Waiting for fix',
            description: 'There is nothing to do for this ticket',
          },
        ],
      })
    );
    const res = await converter.convert(record, fieldCtx);
    expect(res).toMatchSnapshot();
  });
});

describe('tags', () => {
  const converter = new Tags();
  const tag = {name: 'support', count: 1};
  const ctx = new StreamContext(new AirbyteLogger(), {edition_configs: {}}, {});
  test('tag', async () => {
    const record = AirbyteRecord.make('tag', tag);

    const res = await converter.convert(record);
    expect(res).toMatchSnapshot();
  });
});

describe('users', () => {
  const converter = new Users();
  const user = {
    id: 111,
    url: 'https://example.zendesk.com/api/v2/users/111.json',
    name: 'The Customer',
    email: 'customer@example.com',
    created_at: '2024-01-24T14:17:56Z',
    updated_at: '2024-01-24T14:17:56Z',
    active: true,
  };

  test('user', async () => {
    const record = AirbyteRecord.make('user', user);
    const res = await converter.convert(record);
    expect(res).toMatchSnapshot();
  });

  test('suspended user', async () => {
    const record = AirbyteRecord.make('user', {
      ...user,
      suspended: true,
    });
    const res = await converter.convert(record);
    expect(res).toMatchSnapshot();
  });
});
