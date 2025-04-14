import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';

import {StreamContext} from '../../src/converters/converter';
import {
  GroupsStream,
  TicketFieldsStream,
  TicketMetricsStream,
} from '../../src/converters/zendesk/common';
import {Groups} from '../../src/converters/zendesk/groups';
import {SatisfactionRatings} from '../../src/converters/zendesk/satisfaction_ratings';
import {Tags} from '../../src/converters/zendesk/tags';
import {Tickets} from '../../src/converters/zendesk/tickets';
import {Users} from '../../src/converters/zendesk/users';
import {initMockttp, tempConfig} from '../../src/testing-tools/testing-tools';
import {destinationWriteTest} from '../../src/testing-tools/utils';

describe('zendesk', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      source_specific_configs: {zendesk: {sync_groups: true}},
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/zendesk/catalog.json',
      inputRecordsPath: 'zendesk/all-streams.log',
    });
  });
});

describe('tickets', () => {
  const converter = new Tickets();
  const ctx = new StreamContext(
    new AirbyteLogger(),
    {
      edition_configs: {},
      source_specific_configs: {
        zendesk: {
          ticket_additional_fields: [
            'Affected Systems',
            'Needs More Triage',
            'Agent internal comments',
            'Reply customer on',
          ],
        },
      },
    },
    {}
  );

  ctx.set(
    TicketFieldsStream.asString,
    '1',
    AirbyteRecord.make('ticket_fields', {
      id: 1,
      type: 'multiselect',
      title: 'Affected Systems',
    })
  );
  ctx.set(
    TicketFieldsStream.asString,
    '2',
    AirbyteRecord.make('ticket_fields', {
      id: 2,
      type: 'checkbox',
      title: 'Needs More Triage',
    })
  );
  ctx.set(
    TicketFieldsStream.asString,
    '3',
    AirbyteRecord.make('ticket_fields', {
      id: 3,
      type: 'text',
      title: 'Agent internal comments',
    })
  );
  ctx.set(
    TicketFieldsStream.asString,
    '4',
    AirbyteRecord.make('ticket_fields', {
      id: 4,
      type: 'date',
      title: 'Reply customer on',
    })
  );
  ctx.set(
    TicketFieldsStream.asString,
    '30',
    AirbyteRecord.make('ticket_fields', {
      id: 30,
      type: 'integer',
      title: 'Version impacted',
    })
  );
  ctx.set(
    TicketFieldsStream.asString,
    '6',
    AirbyteRecord.make('ticket_fields', {
      title: 'Ticket status',
      id: 6,
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
    due_at: '2024-02-01T00:00:00Z',
    tags: [],
    custom_fields: [],
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

  test('tags', async () => {
    const record = AirbyteRecord.make('ticket', {
      ...ticket,
      tags: ['tag1', 'tag2'],
    });
    const res = await converter.convert(record, ctx);
    expect(res).toMatchSnapshot();
  });

  test('assignee', async () => {
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

  test('solved', async () => {
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

  test('follow ups', async () => {
    const record = AirbyteRecord.make('ticket', {
      ...ticket,
      followup_ids: [2],
    });
    const res = await converter.convert(record, ctx);
    expect(res).toMatchSnapshot();
  });

  test('custom status', async () => {
    const record = AirbyteRecord.make('ticket', {
      ...ticket,
      status: 'pending',
      custom_status_id: 23328843804692,
    });
    const res = await converter.convert(record, ctx);
    expect(res).toMatchSnapshot();
  });

  test('additional fields', async () => {
    const record = AirbyteRecord.make('ticket', {
      ...ticket,
      custom_fields: [
        {id: 1, value: ['api', 'ui']},
        {id: 2, value: true},
        {id: 3, value: 'No extra work needed'},
        {id: 4, value: null},
        {id: 30, value: 3},
      ],
    });
    const res = await converter.convert(record, ctx);
    const taskRec = res.find((r) => r.model === 'tms_Task');
    expect(taskRec.record.additionalFields).toHaveLength(4);
    expect(res).toMatchSnapshot();
  });
});

describe('tags', () => {
  const converter = new Tags();
  const tag = {name: 'support', count: 1};
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

describe('satisfaction ratings', () => {
  const converter = new SatisfactionRatings();

  const ctx = new StreamContext(new AirbyteLogger(), {edition_configs: {}}, {});
  ctx.set(
    GroupsStream.asString,
    '101',
    AirbyteRecord.make('groups', {
      id: 101,
      name: 'Group 101',
      description: 'Group 101',
    })
  );

  const rating = {
    id: 1,
    ticket_id: 15,
    score: 'offered',
    created_at: '2024-02-07T21:51:23Z',
    updated_at: '2024-02-07T21:51:23Z',
    comment: null,
    group_id: 101,
  };

  test('rating', async () => {
    const record = AirbyteRecord.make('satisfaction_rating', rating);

    const res = await converter.convert(record, ctx);
    expect(res).toHaveLength(3);
    expect(res).toMatchSnapshot();
  });

  test('fallback to group when no group in context', async () => {
    const fallbackCtx = new StreamContext(
      new AirbyteLogger(),
      {
        edition_configs: {},
        source_specific_configs: {
          zendesk: {
            team_mapping: {'*': 'all_teams'},
          },
        },
      },
      {}
    );
    const record = AirbyteRecord.make('satisfaction_rating', rating);

    const res = await converter.convert(record, fallbackCtx);
    expect(res).toHaveLength(2);
    expect(res).toMatchSnapshot();
  });
});

describe('groups', () => {
  const ctx = new StreamContext(
    new AirbyteLogger(),
    {
      edition_configs: {},
      source_specific_configs: {
        zendesk: {
          sync_groups: true,
          team_mapping: {
            '*': 'all_teams',
            'Group 1': 'Team 1',
          },
        },
      },
    },
    {}
  );

  const converter = new Groups();
  const group = {id: 1, name: 'Group 1', description: 'Group 1'};

  test('group', async () => {
    const teamCtx = new StreamContext(
      new AirbyteLogger(),
      {
        edition_configs: {},
        source_specific_configs: {
          zendesk: {sync_groups: true},
        },
      },
      {}
    );
    const record = AirbyteRecord.make('group', group);
    const res = await converter.convert(record, teamCtx);
    expect(res).toMatchSnapshot();
  });

  test('team mapping', async () => {
    const record = AirbyteRecord.make('group', group);
    const res = await converter.convert(record, ctx);
    expect(res).toMatchSnapshot();
  });

  test('fallback team', async () => {
    const record = AirbyteRecord.make('group', {...group, name: 'Group 2'});
    const res = await converter.convert(record, ctx);
    expect(res).toMatchSnapshot();
  });

  test('syncing disabled', async () => {
    const syncCtx = new StreamContext(
      new AirbyteLogger(),
      {
        edition_configs: {},
        source_specific_configs: {
          zendesk: {sync_groups: false},
        },
      },
      {}
    );

    const record = AirbyteRecord.make('group', {...group, name: 'Group 3'});
    const res = await converter.convert(record, syncCtx);
    expect(res).toHaveLength(0);
  });
});
