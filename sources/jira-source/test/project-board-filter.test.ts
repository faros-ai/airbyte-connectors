import {
  AirbyteLogger,
  AirbyteLogLevel,
  readTestResourceAsJSON,
} from 'faros-airbyte-cdk';

import {JiraConfig} from '../src/jira';
import {ProjectBoardFilter} from '../src/project-board-filter';
import {iterate, paginate, setupJiraInstance} from './utils/test-utils';

describe('ProjectBoardFilter', () => {
  let logger: AirbyteLogger;
  let config: JiraConfig;
  let mockedImplementation: any;

  beforeAll(() => {
    logger = new AirbyteLogger(AirbyteLogLevel.DEBUG);
    config = readTestResourceAsJSON('project_board_filter/config.json');
  });

  beforeEach(() => {
    const searchProjects = paginate(
      readTestResourceAsJSON('project_board_filter/projects.json'),
      'values',
      50
    );
    const getAllBoards = paginate(
      readTestResourceAsJSON('project_board_filter/boards.json'),
      'values',
      50,
      true
    );
    mockedImplementation = {
      v2: {projects: {searchProjects}},
      agile: {board: {getAllBoards}},
    };
    setupJiraInstance(mockedImplementation, true, config, logger);
  });

  test('getProjects - all projects - no list', async () => {
    const projectBoardFilter = new ProjectBoardFilter(config, logger);
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjects - all projects - empty list', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, projects: []},
      logger
    );
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjects - specific projects included', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, projects: ['TEST-1', 'TEST-2']},
      logger
    );
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjects - specific projects excluded', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, excluded_projects: ['TEST-1']},
      logger
    );
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getBoards - all boards - no list', async () => {
    const projectBoardFilter = new ProjectBoardFilter(config, logger);
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoards - all boards - empty list', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, boards: []},
      logger
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoards - specific boards included', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, boards: ['2', '3']},
      logger
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoards - specific boards excluded', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, excluded_boards: ['2']},
      logger
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoards (FarosGraph) - Faros credentials are required', async () => {
    expect(
      () =>
        new ProjectBoardFilter(
          {...config, use_faros_graph_boards_selection: true},
          logger
        )
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Faros credentials are required'),
      })
    );
  });

  test('getBoards (FarosGraph) - nothing included - nothing excluded', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, use_faros_graph_boards_selection: true},
      logger,
      mockFarosOptions([])
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoards (FarosGraph) - some included - nothing excluded', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, use_faros_graph_boards_selection: true},
      logger,
      mockFarosOptions(['2', '3'], 'Included')
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoards (FarosGraph) - nothing included - some excluded', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, use_faros_graph_boards_selection: true},
      logger,
      mockFarosOptions(['2'], 'Excluded')
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });
});

function mockFarosOptions(
  uids: string[],
  inclusionCategory?: 'Included' | 'Excluded'
): any {
  return {
    nodeIterable: () =>
      iterate(uids.map((uid) => taskBoardOptions(uid, inclusionCategory))),
  };
}

function taskBoardOptions(
  uid: string,
  inclusionCategory: 'Included' | 'Excluded'
) {
  return {
    board: {
      uid,
    },
    inclusionCategory,
  };
}
