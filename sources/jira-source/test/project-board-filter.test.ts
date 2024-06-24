import {
  AirbyteLogger,
  AirbyteLogLevel,
  readTestResourceAsJSON,
} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';

import {JiraConfig} from '../lib/jira';
import {ProjectBoardFilter} from '../src/project-board-filter';
import {paginate, setupJiraInstance} from './resources/common';

describe('ProjectBoardFilter', () => {
  let logger: AirbyteLogger;
  let farosClient: FarosClient;
  let config: JiraConfig;
  let mockedImplementation: any;

  beforeAll(() => {
    logger = new AirbyteLogger(AirbyteLogLevel.DEBUG);
    farosClient = new FarosClient({
      url: 'https://dev.api.faros.ai',
      apiKey: 'SECRET',
    });
    config = readTestResourceAsJSON('project-board-filter/config.json');
  });

  beforeEach(() => {
    const searchProjects = paginate(
      readTestResourceAsJSON('project-board-filter/projects.json'),
      'values',
      50
    );
    const getAllBoards = paginate(
      readTestResourceAsJSON('project-board-filter/boards.json'),
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

  test('getProjectsFromFaros - all projects', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      config,
      logger,
      farosClient
    );
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjectsFromFaros - specific projects included', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, projects_included: ['TEST-1', 'TEST-2']},
      logger,
      farosClient
    );
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjectsFromFaros - specific projects excluded', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, projects_excluded: ['TEST-1']},
      logger,
      farosClient
    );
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjectsFromFaros - specific projects included and excluded', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {
        ...config,
        projects_included: ['TEST-1', 'TEST-2'],
        projects_excluded: ['TEST-2'],
      },
      logger,
      farosClient
    );
    const projects = await projectBoardFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getBoardsFromFaros - all boards', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      config,
      logger,
      farosClient
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoardsFromFaros - specific boards included', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, boards_included: ['2', '3']},
      logger,
      farosClient
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoardsFromFaros - specific boards excluded', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, boards_excluded: ['2']},
      logger,
      farosClient
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getBoardsFromFaros - specific boards included and excluded', async () => {
    const projectBoardFilter = new ProjectBoardFilter(
      {...config, boards_included: ['1', '2'], boards_excluded: ['2']},
      logger,
      farosClient
    );
    const boards = await projectBoardFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });
});
