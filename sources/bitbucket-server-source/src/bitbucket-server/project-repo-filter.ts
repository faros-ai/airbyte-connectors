import {toLower} from 'lodash';

export class ProjectRepoFilter {
  projects: Set<string>;
  repos: Map<string, Set<string>>;

  constructor(
    projectKeys: ReadonlyArray<string>,
    repositoryNames: ReadonlyArray<string>
  ) {
    this.projects = new Set(
      projectKeys.map((projectKey) => toLower(projectKey))
    );
    this.repos = new Map();

    for (const repositoryName of repositoryNames) {
      const [projectKey, repoName] = this.parseRepository(repositoryName);

      this.projects.add(projectKey);
      if (!this.repos.has(projectKey)) {
        this.repos.set(projectKey, new Set());
      }
      this.repos.get(projectKey).add(repoName);
    }
  }

  getProjectKeys(): ReadonlyArray<string> {
    return Array.from(this.projects);
  }

  isIncluded(repository: string): boolean {
    if (!this.projects.size && !this.repos.size) {
      return true;
    }
    const [projectKey, repoName] = this.parseRepository(repository);
    return this.repos.has(projectKey)
      ? this.repos.get(projectKey).has(repoName)
      : this.projects.has(projectKey);
  }

  private parseRepository(repository: string): [string, string] {
    let [projectKey, repoName] = repository.split('/');
    if (!projectKey || !repoName) {
      throw new Error(`Invalid repository name: ${repository}`);
    }
    projectKey = toLower(projectKey);
    repoName = toLower(repoName);
    return [projectKey, repoName];
  }
}
