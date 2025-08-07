import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosChanges} from '../../src/converters/gerrit/faros_changes';
import {FarosProjects} from '../../src/converters/gerrit/faros_projects';
import {FarosUsers} from '../../src/converters/gerrit/faros_users';
import {StreamContext} from '../../src/converters/converter';

interface GerritProject {
  id: string;
  name: string;
  description?: string;
  state?: string;
}

describe('Gerrit Converters', () => {
  const logger = new AirbyteLogger();
  const ctx: StreamContext = {
    config: {
      edition_configs: {},
      source_specific_configs: {
        gerrit: {
          server_url: 'https://gerrit.test',
        },
      },
    },
    logger,
  };

  describe('FarosProjects', () => {
    it('should convert a Gerrit project record', async () => {
      const project: GerritProject = {
        id: 'my-project',
        name: 'my-project',
        description: 'My Project',
        state: 'ACTIVE',
      };
      const record = AirbyteRecord.make('faros_projects', project);
      const converter = new FarosProjects();
      const result = await converter.convert(record, ctx);
      expect(result).toMatchSnapshot();
    });
  });

  describe('FarosUsers', () => {
    it('should convert a Gerrit user record', async () => {
      const user = {
        _account_id: 1,
        name: 'Test User',
        email: 'test@gerrit.test',
        username: 'testuser',
      };
      const record = AirbyteRecord.make('faros_users', user);
      const converter = new FarosUsers();
      const result = await converter.convert(record, ctx);
      expect(result).toMatchSnapshot();
    });
  });

  describe('FarosChanges', () => {
    it('should convert a Gerrit change record', async () => {
      const change = {
        _number: 123,
        project: 'my-project',
        subject: 'My Change',
        owner: {_account_id: 1, name: 'Test User', email: 'test@gerrit.test', username: 'testuser'},
        id: 'my-project~123',
        branch: 'main',
        change_id: 'I123abc',
        status: 'NEW',
        created: '2023-01-01T00:00:00Z',
        updated: '2023-01-01T00:00:00Z',
        insertions: 10,
        deletions: 5,
      };
      const record = AirbyteRecord.make('faros_changes', change);
      const converter = new FarosChanges();
      const result = await converter.convert(record, ctx);
      expect(result).toMatchSnapshot();
    });
  });
});
