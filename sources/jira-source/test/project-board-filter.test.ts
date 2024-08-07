import {
  AirbyteLogger,
  AirbyteLogLevel,
  readTestResourceAsJSON,
} from 'faros-airbyte-cdk';

import {JiraConfig} from '../src/jira';
import {ProjectBoardFilter} from '../src/project-board-filter';
import {paginate, setupJiraInstance} from './utils/test-utils';

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

  test('getProjectsFromFaros - all projects - no projects list', async () => {
    const projectBoardFilter = new ProjectBoardFilter(config, logger);
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjectsFromFaros - all projects - empty projects list', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, projects: []},
      logger
    );
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjectsFromFaros - specific projects included', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, projects: ['TEST-1', 'TEST-2']},
      logger
    );
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjectsFromFaros - specific projects excluded', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, excluded_projects: ['TEST-1']},
      logger
    );
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getBoardsFromFaros - all boards - no list', async () => {
    const projectBoardFilter = new ProjectBoardFilter(config, logger);
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoardsFromFaros - all boards - empty list', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, boards: []},
      logger
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoardsFromFaros - specific boards included', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, boards: ['2', '3']},
      logger
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoardsFromFaros - specific boards excluded', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, excluded_boards: ['2']},
      logger
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });
});
