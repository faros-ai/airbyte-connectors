import {AirbyteConfig, AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {driveactivity_v2, google} from 'googleapis';
import {Dictionary} from 'ts-essentials';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

const DEFAULT_CUTOFF_DAYS = 90;

export interface DriveActivityEvent extends driveactivity_v2.Schema$DriveActivity {
  nextPageToken?: string;
  primaryTime?: string;
}

export interface GoogleDriveActivityConfig extends AirbyteConfig {
  readonly client_email: string;
  readonly private_key: string;
  readonly delegated_user?: string;
  readonly cutoff_days?: number;
  readonly domain_wide_delegation?: boolean;
}

type PaginationReqFunc = (pageToken?: string) => Promise<any>;
type ErrorWrapperReqFunc<T> = (...opts: any) => Promise<T>;

export class GoogleDriveActivity {
  private static googleDriveActivities: Dictionary<GoogleDriveActivity> = {};

  constructor(
    private readonly client: driveactivity_v2.Driveactivity,
    private readonly delegatedUser: string,
    private readonly cutoffDays: number,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: GoogleDriveActivityConfig,
    logger: AirbyteLogger
  ): Promise<GoogleDriveActivity> {
    const delegatedUser = config.delegated_user || config.client_email;
    if (GoogleDriveActivity.googleDriveActivities[delegatedUser]) {
      return GoogleDriveActivity.googleDriveActivities[delegatedUser];
    }

    if (typeof config.private_key !== 'string') {
      throw new VError('private_key: must be a string');
    }
    if (typeof config.client_email !== 'string') {
      throw new VError('client_email: must be a string');
    }

    const clientOptions =
      config.domain_wide_delegation === true && config.delegated_user
        ? {subject: config.delegated_user}
        : {};

    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive.activity.readonly'],
      credentials: {
        private_key: config.private_key.replace(/\\n/g, '\n'),
        client_email: config.client_email,
      },
      clientOptions,
    });

    const driveActivityClient = google.driveactivity({version: 'v2', auth});
    const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;

    GoogleDriveActivity.googleDriveActivities[delegatedUser] = new GoogleDriveActivity(
      driveActivityClient,
      delegatedUser,
      cutoffDays,
      logger
    );
    return GoogleDriveActivity.googleDriveActivities[delegatedUser];
  }

  private async invokeCallWithErrorWrapper<T>(
    func: ErrorWrapperReqFunc<T>,
    message = '',
    pageToken?: string
  ): Promise<T> {
    let res: T;
    try {
      res = await func(pageToken);
    } catch (err: any) {
      this.wrapAndThrow(err, message);
    }
    return res;
  }

  private wrapAndThrow(err: any, message = ''): void {
    if (err.error_code || err.error_info) {
      throw new VError(`${err.error_code}: ${err.error_info}`);
    }
    let errorMessage = message;
    try {
      errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
    } catch (wrapError: any) {
      errorMessage += wrapError.message;
    }
    throw new VError(errorMessage);
  }

  private async *paginate(
    func: PaginationReqFunc
  ): AsyncGenerator {
    let nextPageToken: string | undefined;

    do {
      const response = await this.invokeCallWithErrorWrapper(
        func,
        '',
        nextPageToken
      );

      if (response?.status >= 300) {
        throw new VError(`${response?.status}: ${response?.statusText}`);
      }
      
      const activities = response?.data?.activities || [];
      const newPageToken = response?.data?.nextPageToken;
      
      for (const activity of activities) {
        if (activity?.timestamp?.time) {
          yield {...activity, nextPageToken: newPageToken, primaryTime: activity.timestamp.time};
        } else {
          yield {...activity, nextPageToken: newPageToken};
        }
      }

      nextPageToken = newPageToken;
    } while (nextPageToken);
  }

  async *queryActivities(timeFilterType: string, startTime?: string): AsyncGenerator<DriveActivityEvent> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - this.cutoffDays);

    const formattedStartTime = startTime || startDate.toISOString();
    
    const func = (pageToken?: string): Promise<DriveActivityEvent> => {
      this.logger.debug(
        `Querying Drive activities with ${timeFilterType} since ${formattedStartTime}`
      );
      
      const params: driveactivity_v2.Params$Resource$Activity$Query = {
        requestBody: {
          ancestorName: 'root', // Query for all activities
          pageToken,
          filter: JSON.stringify({
            timeFilter: {
              [timeFilterType]: {
                time: formattedStartTime
              }
            }
          })
        }
      };
      
      return this.client.activity.query(params) as any;
    };

    yield* this.paginate(func);
  }
}
