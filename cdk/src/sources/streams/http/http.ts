import axios, {AxiosRequestConfig, AxiosResponse, Method} from 'axios';
import {inRange} from 'lodash';
import {Dictionary} from 'ts-essentials';
import VError from 'verror';

import {AirbyteLogger} from '../../../logger';
import {SyncMode} from '../../../protocol';
import {AirbyteStreamBase} from '../core';
import {HttpAuthenticator, NoAuth} from './auth/core';

// list of all possible HTTP methods which can be used for sending of request
// bodies
const BODY_REQUEST_METHODS = ['POST', 'PUT', 'PATCH'];

/**
 * Base abstract class for an Airbyte Stream using the HTTP protocol. Basic
 * building block for users building an Airbyte source for a HTTP API.
 */
export abstract class AirbyteHttpStream extends AirbyteStreamBase {
  constructor(
    private readonly authenticator: HttpAuthenticator = new NoAuth()
  ) {
    super(new AirbyteLogger());
  }

  /**
   * Most HTTP streams use a source defined cursor (i.e: the user can't
   * configure it like on a SQL table)
   */
  get sourceDefinedCursor(): boolean {
    return true;
  }

  /**
   * @returns URL base for the  API endpoint e.g: if you wanted to hit
   * https://myapi.com/v1/some_entity then this should return
   * "https://myapi.com/v1/"
   */
  abstract get urlBase(): string;

  /**
   * Override if needed. See get_request_data/get_request_json if using
   * POST/PUT/PATCH.
   */
  get httpMethod(): Method {
    return 'GET';
  }

  /**
   * Override this method to define a pagination strategy.
   *
   * The value returned from this method is passed to most other methods in this
   * class. Use it to form a request e.g: set headers or query params.
   *
   * @returns The token for the next page from the input response object.
   * Returning undefined means there are no more pages to read in this response.
   */
  abstract nextPageToken(response: AxiosResponse): Dictionary<any> | undefined;

  /**
   * @returns the URL path for the API endpoint e.g: if you wanted to hit
   * https://myapi.com/v1/some_entity then this should return "some_entity"
   */
  abstract path(
    streamState?: Dictionary<any>,
    streamSlice?: Dictionary<any>,
    nextPageToken?: Dictionary<any>
  ): string;

  /**
   * Override this method to define the query parameters that should be set on
   * an outgoing HTTP request given the inputs.
   *
   * E.g: you might want to define query parameters for paging if
   * nextPageToken is undefined.
   */
  requestParams(
    streamState: Dictionary<any>,
    streamSlice?: Dictionary<any>,
    nextPageToken?: Dictionary<any>
  ): Dictionary<any> {
    return {};
  }

  /**
   * Override to return any non-auth headers. Authentication headers will
   * overwrite any overlapping headers returned from this method.
   */
  requestHeaders(
    streamState: Dictionary<any>,
    streamSlice?: Dictionary<any>,
    nextPageToken?: Dictionary<any>
  ): Dictionary<any> {
    return {};
  }

  /**
   * Override when creating POST/PUT/PATCH requests to populate the body of the
   * request with a non-JSON payload.
   *
   * If returns a ready text that it will be sent as is.
   * If returns a dict that it will be converted to a urlencoded form.
   *   E.g. {"key1": "value1", "key2": "value2"} => "key1=value1&key2=value2"
   *
   * At the same time only one of the 'requestBodyData' and
   * 'requestBodyJson' functions can be overridden.
   */
  requestBodyData(
    streamState: Dictionary<any>,
    streamSlice?: Dictionary<any>,
    nextPageToken?: Dictionary<any>
  ): Dictionary<any, any> | string | undefined {
    return undefined;
  }

  /**
   * Override when creating POST/PUT/PATCH requests to populate the body of the
   * request with a JSON payload.
   *
   * At the same time only one of the 'requestBodyData' and
   * 'requestBodyJson' functions can be overridden.
   */
  requestBodyJson(
    streamState: Dictionary<any>,
    streamSlice?: Dictionary<any>,
    nextPageToken?: Dictionary<any>
  ): Dictionary<any, any> | undefined {
    return undefined;
  }

  // TODO: request kwargs

  /**
   * Parses the raw response object into a list of records.
   */
  abstract parseResponse(
    response: AxiosResponse,
    streamState: Dictionary<any>,
    streamSlice?: Dictionary<any>,
    nextPageToken?: Dictionary<any>
  ): Generator<Dictionary<any>>;

  /**
   * Override to set different conditions for backoff based on the response from
   * the server.
   *
   * By default, back off on the following HTTP response statuses:
   *  - 429 (Too Many Requests) indicating rate limiting
   *  - 500s to handle transient server errors
   *
   * Unexpected but transient exceptions (connection timeout, DNS resolution
   * failed, etc..) are retried by default.
   */
  shouldRetry(response: AxiosResponse): boolean {
    return response.status === 429 || inRange(response.status, 500, 600);
  }

  /**
   * Override this method to dynamically determine backoff time e.g: by reading
   * the X-Retry-After header.
   *
   * This method is called only if should_backoff() returns True for the input request.
   *
   * @returns how long to backoff in seconds. The return value may be a floating
   * point number for subsecond precision. Returning undefined defers backoff to
   * the default backoff behavior (e.g using an exponential algorithm).
   */
  backoffTime(response: AxiosResponse): number | undefined {
    return undefined;
  }

  private createPreparedRequest(
    path: string,
    headers?: Dictionary<any>,
    params?: Dictionary<any>,
    json?: any,
    data?: any
  ): AxiosRequestConfig {
    const config: AxiosRequestConfig = {
      method: this.httpMethod,
      url: this.urlBase + path,
      headers,
      params,
      validateStatus: (status) => {
        if (
          this.shouldRetry({
            status,
            data: undefined,
            statusText: '',
            headers: undefined,
            config: {},
          })
        ) {
          return true;
        }
        return inRange(status, 200, 300);
      },
    };
    if (BODY_REQUEST_METHODS.includes(this.httpMethod.toUpperCase())) {
      if (json && data) {
        throw new VError(
          "At the same time only one of the 'requestBodyData' and 'requestBodyJson' functions can return data"
        );
      } else if (json) {
        config.data = json;
      } else if (data) {
        config.data = data;
      }
    }
    return config;
  }

  // TODO: backoff decorators
  private async sendRequest(
    request: AxiosRequestConfig
  ): Promise<AxiosResponse> {
    const response = await axios.request(request);
    if (this.shouldRetry(response)) {
      const customBackoffTime = this.backoffTime(response);
      if (customBackoffTime) {
        throw new VError('UserDefinedBackoffException');
      } else {
        throw new VError('DefaultBackoffException');
      }
    }
    return response;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any>> {
    streamState = streamState ?? {};
    let paginationComplete = false;

    let nextPageToken: Dictionary<any> | undefined = undefined;
    while (!paginationComplete) {
      const requestHeaders = this.requestHeaders(
        streamState,
        streamSlice,
        nextPageToken
      );
      const request = this.createPreparedRequest(
        this.path(streamState, streamSlice, nextPageToken),
        {...requestHeaders, ...(await this.authenticator.getAuthHeader())},
        this.requestParams(streamState, streamSlice, nextPageToken),
        this.requestBodyJson(streamState, streamSlice, nextPageToken),
        this.requestBodyData(streamState, streamSlice, nextPageToken)
      );
      const response = await this.sendRequest(request);
      yield* this.parseResponse(response, streamState, streamSlice);

      nextPageToken = this.nextPageToken(response);
      if (!nextPageToken) {
        paginationComplete = true;
      }
    }
  }
}
