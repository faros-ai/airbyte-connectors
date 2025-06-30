import {AirbyteConfig, AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {
  DriveActivityEvent,
  WorkspaceCustomer,
  WorkspaceUser,
} from 'faros-airbyte-common/googledrive';
import {Utils} from 'faros-js-client';
import {admin_directory_v1, Auth, driveactivity_v2, google} from 'googleapis';
import {random} from 'lodash';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

export type PersonalDrive = {
  userEmail: string;
  sharedDriveId: never;
};

export type SharedDrive = {
  userEmail: never;
  sharedDriveId: string;
};

export type Drive = PersonalDrive | SharedDrive;

export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_INCLUDE_PERSONAL_DRIVES = true;
export const DEFAULT_MAX_RETRIES = 5;
export const DEFAULT_RETRY_DELAY = 1000;

export const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.customer.readonly',
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
  'https://www.googleapis.com/auth/drive.activity.readonly',
];

export interface GoogleDriveConfig extends AirbyteConfig {
  readonly client_email: string;
  readonly private_key: string;
  readonly delegated_admin_user?: string;
  readonly shared_drive_ids?: ReadonlyArray<string>;
  readonly include_personal_drives?: boolean;
  readonly cutoff_days?: number;
  readonly max_retries?: number;
  readonly retry_delay?: number;
}

type PaginationReqFunc = (pageToken?: string) => Promise<any>;
type ErrorWrapperReqFunc<T> = (...opts: any) => Promise<T>;

export class GoogleDrive {
  private static googleDrive: GoogleDrive;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(
    config: GoogleDriveConfig,
    private readonly credentials: Auth.JWTInput,
    private readonly auth: Auth.GoogleAuth,
    private readonly adminDirectoryClient: admin_directory_v1.Admin,
    private readonly driveActivityClient: driveactivity_v2.Driveactivity,
    private readonly logger: AirbyteLogger
  ) {
    this.maxRetries = config.max_retries ?? DEFAULT_MAX_RETRIES;
    this.retryDelay = config.retry_delay ?? DEFAULT_RETRY_DELAY;
  }

  static async instance(
    config: GoogleDriveConfig,
    logger: AirbyteLogger
  ): Promise<GoogleDrive> {
    if (GoogleDrive.googleDrive) {
      return GoogleDrive.googleDrive;
    }

    if (typeof config.private_key !== 'string') {
      throw new VError('private_key: must be a string');
    }
    if (typeof config.client_email !== 'string') {
      throw new VError('client_email: must be a string');
    }

    const clientOptions = config.delegated_admin_user
      ? {subject: config.delegated_admin_user}
      : {};

    const credentials: Auth.JWTInput = {
      private_key: config.private_key.replace(/\\n/g, '\n'),
      client_email: config.client_email,
    };
    const auth = new google.auth.GoogleAuth({
      scopes: REQUIRED_SCOPES,
      credentials,
      clientOptions,
    });

    const adminDirectoryClient = google.admin({version: 'directory_v1', auth});
    const driveActivityClient = google.driveactivity({version: 'v2', auth});

    GoogleDrive.googleDrive = new GoogleDrive(
      config,
      credentials,
      auth,
      adminDirectoryClient,
      driveActivityClient,
      logger
    );
    return GoogleDrive.googleDrive;
  }

  async checkConnection(): Promise<void> {
    try {
      const token = await this.auth.getAccessToken();
      if (!token) {
        throw new VError('Could not get access token');
      }
      await this.getWorkspaceCustomer();
    } catch (err: any) {
      throw new VError(err);
    }
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff with jitter as recommended by Google
    // Wait time = min(((2^n) * base_delay + random_jitter), max_backoff)
    const exponentialDelay = Math.pow(2, attempt) * this.retryDelay;
    const jitter = random(0, 1000); // Random jitter up to 1 second
    return Math.min(exponentialDelay + jitter, 64000); // 64 seconds as recommended by Google
  }

  private isRetryableError(err: any): boolean {
    const status = err?.response?.status || err?.status || err?.code;
    const message = err?.message || err?.response?.data?.error?.message || '';

    // Check for quota exceeded status codes and specific error messages
    return (
      status === 403 ||
      status === 429 ||
      status >= 500 ||
      message.includes('quota') ||
      message.includes('Quota exceeded') ||
      message.includes('Rate limit') ||
      message.includes('Too many requests') ||
      message.includes('User rate limit exceeded')
    );
  }

  private async invokeCallWithErrorWrapper<T>(
    func: ErrorWrapperReqFunc<T>,
    message = '',
    pageToken?: string
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await func(pageToken);
      } catch (err: any) {
        lastError = err;

        // Check if this is a retryeable error that should be retried
        if (this.isRetryableError(err) && attempt < this.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          this.logger.info(
            `Google Drive API error. Retrying in ${delay}ms ` +
              `(attempt ${attempt + 1}/${this.maxRetries}). Error: ${err.message}`
          );
          await Utils.sleep(delay);
          continue;
        }

        // If it's not a retryable error or we've exhausted retries, break
        break;
      }
    }

    // If we get here, we've either exhausted retries or hit a non-retryable error
    this.wrapAndThrow(lastError, message);
  }

  private wrapAndThrow(err: any, errMessage = ''): void {
    if (err.error_code || err.error_info) {
      throw new VError(`${err.error_code}: ${err.error_info}`);
    }
    let errorMessage = `${errMessage}: `;
    try {
      errorMessage += err.errMessage ?? err.statusText ?? wrapApiError(err);
    } catch (wrapError: any) {
      errorMessage += wrapError.message;
    }
    throw new VError(errorMessage);
  }

  private async *paginate<T>(
    func: PaginationReqFunc,
    itemsField: string,
    errMessage = ''
  ): AsyncGenerator<T> {
    let nextPageToken: string | undefined;

    do {
      const response = await this.invokeCallWithErrorWrapper(
        func,
        errMessage,
        nextPageToken
      );

      if (response?.status >= 300) {
        throw new VError(`${response?.status}: ${response?.statusText}`);
      }

      const items = response?.data?.[itemsField] ?? [];
      const newPageToken = response?.data?.nextPageToken;

      for (const item of items) {
        yield item;
      }

      nextPageToken = newPageToken;
    } while (nextPageToken);
  }

  async *queryActivities(
    drive: Drive,
    startTime: Date
  ): AsyncGenerator<DriveActivityEvent> {
    const formattedStartTime = startTime.toISOString();

    let ancestorName: string;
    let driveActivityClient: driveactivity_v2.Driveactivity;
    if (drive.userEmail) {
      ancestorName = 'items/root';
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/drive.activity.readonly'],
        credentials: this.credentials,
        clientOptions: {subject: drive.userEmail},
      });
      driveActivityClient = google.driveactivity({version: 'v2', auth});
    } else {
      ancestorName = `items/${drive.sharedDriveId}`;
      driveActivityClient = this.driveActivityClient;
    }

    const func = (pageToken?: string) => {
      return driveActivityClient.activity.query({
        requestBody: {
          ancestorName,
          pageToken,
          filter: `time >= "${formattedStartTime}"`,
        },
      });
    };

    for await (const activity of this.paginate<driveactivity_v2.Schema$DriveActivity>(
      func,
      'activities',
      'Failed to query Google Drive activity'
    )) {
      yield activity;
    }
  }

  @Memoize()
  async queryWorkspaceUsers(): Promise<WorkspaceUser[]> {
    const func = (pageToken?: string) => {
      return this.adminDirectoryClient.users.list({
        customer: 'my_customer',
        maxResults: 500,
        pageToken,
        projection: 'full',
      });
    };

    const users: WorkspaceUser[] = [];
    for await (const user of this.paginate<WorkspaceUser>(
      func,
      'users',
      'Failed to query Google Workspace users'
    )) {
      users.push(user);
    }
    return users;
  }

  async getWorkspaceCustomer(): Promise<WorkspaceCustomer> {
    const res = await this.invokeCallWithErrorWrapper(
      () =>
        this.adminDirectoryClient.customers.get({
          customerKey: 'my_customer',
        }),
      'Failed to get Google Workspace customer information'
    );
    return res.data;
  }
}
