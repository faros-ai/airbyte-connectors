import axios from 'axios';
import dayjs from 'dayjs';
import {Dictionary} from 'ts-essentials';

import {HttpAuthenticator} from './core';

export class Oauth2Authenticator extends HttpAuthenticator {
  private tokenExpiryDate: dayjs.Dayjs;
  private accessToken?: string;

  constructor(
    private readonly tokenRefreshEndpoint: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
    private readonly scopes?: string[]
  ) {
    super();
    this.tokenExpiryDate = dayjs().subtract(1, 'day');
    this.accessToken = undefined;
  }

  async getAuthHeader(): Promise<Dictionary<any>> {
    return {
      Authorization: `Bearer ${await this.getAccessToken()}`,
    };
  }

  async getAccessToken(): Promise<string> {
    if (this.tokenHasExpired()) {
      const t0 = dayjs();
      const [token, expiresIn] = await this.refreshAccessToken();
      this.accessToken = token;
      this.tokenExpiryDate = t0.add(expiresIn, 'seconds');
    }
    return this.accessToken;
  }

  private tokenHasExpired(): boolean {
    return dayjs().isAfter(this.tokenExpiryDate);
  }

  /**
   * Override to define additional parameters
   */
  protected getRefreshRequestBody(): Dictionary<any> {
    return {
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      scopes: this.scopes,
    };
  }

  /**
   * @returns a tuple of (access_token, token_lifespan_in_seconds)
   */
  private async refreshAccessToken(): Promise<[string, number]> {
    try {
      const response = await axios.post(
        this.tokenRefreshEndpoint,
        this.getRefreshRequestBody()
      );
      const responseJson = response.data;
      return [responseJson['access_token'], responseJson['expires_in']];
    } catch (error) {
      throw new Error('sdf');
    }
  }
}
