import * as sut from '../src/bitbucket-server/project-repo-filter';

describe('ProjectRepoFilter', () => {
  test('getProjectKeys', () => {
    const filter = new sut.ProjectRepoFilter(
      ['proj1', 'PROJ2'],
      ['proj1/repo1', 'proj2/repo2', 'proj3/repo3']
    );
    expect(filter.getProjectKeys()).toStrictEqual(['proj1', 'proj2', 'proj3']);
  });

  test('isIncluded', () => {
    const filter = new sut.ProjectRepoFilter(
      ['proj3'],
      ['proj1/repo1', 'proj2/repo2']
    );
    expect(filter.isIncluded('proj1/repo1')).toBe(true);
    expect(filter.isIncluded('PROJ1/REPO1')).toBe(true);
    expect(filter.isIncluded('proj2/repo2')).toBe(true);
    expect(filter.isIncluded('proj3/repo3')).toBe(true);
    expect(filter.isIncluded('proj1/repo4')).toBe(false);
    expect(filter.isIncluded('proj2/repo5')).toBe(false);
    expect(filter.isIncluded('proj4/repo6')).toBe(false);
  });

  test('include repositories if given empty project list', () => {
    const filter = new sut.ProjectRepoFilter(
      [],
      ['proj1/repo1', 'proj2/repo2']
    );
    expect(filter.isIncluded('proj1/repo1')).toBe(true);
    expect(filter.isIncluded('PROJ1/REPO1')).toBe(true);
    expect(filter.isIncluded('proj2/repo2')).toBe(true);
    expect(filter.isIncluded('proj3/repo3')).toBe(false);
    expect(filter.isIncluded('proj1/repo4')).toBe(false);
    expect(filter.isIncluded('proj2/repo5')).toBe(false);
    expect(filter.isIncluded('proj4/repo6')).toBe(false);
  });

  test('include all projects and repos if none are specified', () => {
    const filter = new sut.ProjectRepoFilter([], []);

    expect(filter.isIncluded('proj1/repo1')).toBe(true);
    expect(filter.isIncluded('PROJ1/REPO1')).toBe(true);
    expect(filter.isIncluded('proj2/repo2')).toBe(true);
    expect(filter.isIncluded('proj3/repo3')).toBe(true);
    expect(filter.isIncluded('proj1/repo4')).toBe(true);
    expect(filter.isIncluded('proj2/repo5')).toBe(true);
    expect(filter.isIncluded('proj4/repo6')).toBe(true);
  });
});
