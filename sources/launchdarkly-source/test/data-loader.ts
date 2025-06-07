import axios, {AxiosInstance} from 'axios';

interface CreatedResources {
  projects: string[];
  environments: string[];
  featureFlags: string[];
  users: string[];
  experiments: string[];
}

export class LaunchDarklyDataLoader {
  private client: AxiosInstance;
  private projectKey: string;
  private createdResources: CreatedResources = {
    projects: [],
    environments: [],
    featureFlags: [],
    users: [],
    experiments: [],
  };

  constructor(token: string, projectKey?: string) {
    this.client = axios.create({
      baseURL: 'https://app.launchdarkly.com/api/v2',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
    });
    this.projectKey = projectKey || `test-project-devin`;
  }

  async loadTestData(): Promise<void> {
    console.log('Creating test project...');
    await this.createProject();

    console.log('Creating test environments...');
    await this.createEnvironments();

    console.log('Creating test feature flags...');
    await this.createFeatureFlags();

    console.log('Creating test users...');
    await this.createUsers();

    console.log('Creating test experiments...');
    await this.createExperiments();

    console.log('Test data loaded successfully!');
  }

  private async createProject(): Promise<void> {
    try {
      const response = await this.client.get(`/projects/${this.projectKey}`);
      if (response.status === 200) {
        console.log(`Project ${this.projectKey} already exists, skipping creation`);
        return;
      }
    } catch (error) {
    }

    const projectData = {
      key: this.projectKey,
      name: `Test Project Devin`,
      tags: ['test', 'automated', 'devin'],
    };

    await this.client.post('/projects', projectData);
    this.createdResources.projects.push(this.projectKey);
  }

  private async createEnvironments(): Promise<void> {
    const environments = [
      {
        key: 'production',
        name: 'Production',
        color: 'FF0000',
        defaultTtl: 0,
        secureMode: true,
        defaultTrackEvents: false,
        requireComments: true,
        confirmChanges: true,
        tags: ['prod', 'devin'],
      },
      {
        key: 'staging',
        name: 'Staging',
        color: '00FF00',
        defaultTtl: 60,
        secureMode: false,
        defaultTrackEvents: true,
        requireComments: false,
        confirmChanges: false,
        tags: ['staging', 'devin'],
      },
    ];

    for (const env of environments) {
      try {
        const response = await this.client.get(`/projects/${this.projectKey}/environments/${env.key}`);
        if (response.status === 200) {
          console.log(`Environment ${env.key} already exists, skipping creation`);
          continue;
        }
      } catch (error) {
      }

      await this.client.post(`/projects/${this.projectKey}/environments`, env);
      this.createdResources.environments.push(env.key);
    }
  }

  private async createFeatureFlags(): Promise<void> {
    const flags = [
      {
        key: 'test-boolean-flag-devin',
        name: 'Test Boolean Flag (Devin)',
        description: 'A test boolean feature flag created by Devin',
        kind: 'boolean',
        variations: [
          {value: true, name: 'True'},
          {value: false, name: 'False'},
        ],
        defaults: {
          onVariation: 0,
          offVariation: 1,
        },
        tags: ['test', 'boolean', 'devin'],
      },
      {
        key: 'test-string-flag-devin',
        name: 'Test String Flag (Devin)',
        description: 'A test string feature flag created by Devin',
        kind: 'multivariate',
        variations: [
          {value: 'option-a', name: 'Option A'},
          {value: 'option-b', name: 'Option B'},
          {value: 'option-c', name: 'Option C'},
        ],
        defaults: {
          onVariation: 0,
          offVariation: 1,
        },
        tags: ['test', 'string', 'devin'],
      },
    ];

    for (const flag of flags) {
      try {
        const response = await this.client.get(`/flags/${this.projectKey}/${flag.key}`);
        if (response.status === 200) {
          console.log(`Feature flag ${flag.key} already exists, skipping creation`);
          continue;
        }
      } catch (error) {
      }

      await this.client.post(`/flags/${this.projectKey}`, flag);
      this.createdResources.featureFlags.push(flag.key);
    }
  }

  private async createUsers(): Promise<void> {
    const users = [
      {
        key: 'test-user-devin-1',
        name: 'Test User Devin 1',
        email: 'test1@devin.example.com',
        anonymous: false,
        country: 'US',
        custom: {
          role: 'admin',
          department: 'engineering',
          source: 'devin',
        },
      },
      {
        key: 'test-user-devin-2',
        name: 'Test User Devin 2',
        email: 'test2@devin.example.com',
        anonymous: false,
        country: 'CA',
        custom: {
          role: 'user',
          department: 'marketing',
          source: 'devin',
        },
      },
    ];

    for (const user of users) {
      try {
        const response = await this.client.get(
          `/users/${this.projectKey}/production/${user.key}`
        );
        if (response.status === 200) {
          console.log(`User ${user.key} already exists, skipping creation`);
          continue;
        }
      } catch (error) {
      }

      try {
        await this.client.put(
          `/users/${this.projectKey}/production/${user.key}`,
          user
        );
        this.createdResources.users.push(user.key);
      } catch (error) {
        console.warn(
          'User creation failed (may be deprecated):',
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }

  private async createExperiments(): Promise<void> {
    const experiments = [
      {
        key: 'test-experiment-devin-1',
        name: 'Test Experiment Devin 1',
        description: 'A test experiment for boolean flag created by Devin',
        hypothesis: 'Enabling the feature will increase engagement',
        environmentKey: 'production',
      },
    ];

    for (const experiment of experiments) {
      try {
        const response = await this.client.get(
          `/projects/${this.projectKey}/experiments/${experiment.key}`
        );
        if (response.status === 200) {
          console.log(`Experiment ${experiment.key} already exists, skipping creation`);
          continue;
        }
      } catch (error) {
      }

      try {
        await this.client.post(
          `/projects/${this.projectKey}/experiments`,
          experiment
        );
        this.createdResources.experiments.push(experiment.key);
      } catch (error) {
        console.warn('Experiment creation failed:', error instanceof Error ? error.message : String(error));
      }
    }
  }

  async cleanup(): Promise<void> {
    console.log('Cleaning up test data...');

    for (const expKey of this.createdResources.experiments) {
      try {
        await this.client.delete(
          `/projects/${this.projectKey}/experiments/${expKey}`
        );
      } catch (error) {
        console.warn(`Failed to delete experiment ${expKey}:`, error instanceof Error ? error.message : String(error));
      }
    }

    for (const flagKey of this.createdResources.featureFlags) {
      try {
        await this.client.delete(`/flags/${this.projectKey}/${flagKey}`);
      } catch (error) {
        console.warn(`Failed to delete flag ${flagKey}:`, error instanceof Error ? error.message : String(error));
      }
    }

    for (const projectKey of this.createdResources.projects) {
      try {
        await this.client.delete(`/projects/${projectKey}`);
      } catch (error) {
        console.warn(`Failed to delete project ${projectKey}:`, error instanceof Error ? error.message : String(error));
      }
    }

    console.log('Cleanup completed');
  }

  getProjectKey(): string {
    return this.projectKey;
  }
}
