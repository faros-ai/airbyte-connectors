import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';
import {readTestResourceAsJSON} from 'faros-airbyte-testing-tools';

import {JiraConfig} from '../src/jira';
import {ProjectFilter} from '../src/project-filter';
import {
  mockFarosOptions,
  paginate,
  setupJiraInstance,
} from './utils/test-utils';

describe('ProjectFilter', () => {
  let logger: AirbyteLogger;
  let config: JiraConfig;
  let mockedImplementation: any;

  beforeAll(() => {
    logger = new AirbyteLogger(AirbyteLogLevel.DEBUG);
    config = readTestResourceAsJSON('project_filter/config.json');
  });

  beforeEach(() => {
    const searchProjects = paginate(
      readTestResourceAsJSON('project_filter/projects.json'),
      'values',
      50
    );
    mockedImplementation = {
      v2: {projects: {searchProjects}},
    };
    setupJiraInstance(mockedImplementation, true, config, logger);
  });

  test('getProjects - all projects - no list', async () => {
    const projectFilter = new ProjectFilter(config, logger);
    const projects = await projectFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjects - all projects - empty list', async () => {
    const projectFilter = new ProjectFilter({...config, projects: []}, logger);
    const projects = await projectFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjects - specific projects included', async () => {
    const projectFilter = new ProjectFilter(
      {...config, projects: ['TEST-1', 'TEST-2']},
      logger
    );
    const projects = await projectFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getProjects - specific projects excluded', async () => {
    const projectFilter = new ProjectFilter(
      {...config, excluded_projects: ['TEST-1']},
      logger
    );
    const projects = await projectFilter.getProjects();
    expect(projects).toMatchSnapshot();
  });

  test('getBoards - returns same result as getProjects - project list', async () => {
    const projectFilter = new ProjectFilter(
      {...config, projects: ['TEST-1']},
      logger
    );
    const projects = await projectFilter.getProjects();
    const boards = await projectFilter.getBoards();
    expect(boards).toEqual(projects);
  });

  test('getBoards - board list wrongly set is ignored', async () => {
    const projectFilter = new ProjectFilter(
      {...config, projects: ['TEST-1'], boards: ['2', '3']},
      logger
    );
    const boards = await projectFilter.getBoards();
    expect(boards).toMatchSnapshot();
  });

  test('getProjects (FarosGraph) - nothing included - nothing excluded', async () => {
    const projectFilter = new ProjectFilter(
      {...config, use_faros_graph_boards_selection: true},
      logger,
      mockFarosOptions({})
    );
    const boards = await projectFilter.getProjects();
    expect(boards).toMatchSnapshot();
  });

  test('getProjects (FarosGraph) - some included - nothing excluded', async () => {
    const projectFilter = new ProjectFilter(
      {...config, use_faros_graph_boards_selection: true},
      logger,
      mockFarosOptions({includedUids: ['TEST-1', 'TEST-3']})
    );
    const boards = await projectFilter.getProjects();
    expect(boards).toMatchSnapshot();
  });

  test('getProjects (FarosGraph) - nothing included - some excluded', async () => {
    const projectFilter = new ProjectFilter(
      {...config, use_faros_graph_boards_selection: true},
      logger,
      mockFarosOptions({excludedUids: ['TEST-2']})
    );
    const boards = await projectFilter.getProjects();
    expect(boards).toMatchSnapshot();
  });

  test('getProjects (FarosGraph) - some included - some excluded', async () => {
    const projectFilter = new ProjectFilter(
      {...config, use_faros_graph_boards_selection: true},
      logger,
      mockFarosOptions({includedUids: ['TEST-2'], excludedUids: ['TEST-3']})
    );
    const boards = await projectFilter.getProjects();
    expect(boards).toMatchSnapshot();
  });
});
