import {VError, WError} from 'verror';

import {wrapApiError} from '../src/errors';

describe('errors', () => {
  function createAxiosError(message: string, cause?: Error): any {
    const error: any = new VError({cause}, message);
    error.isAxiosError = true;
    error.request = {
      url: '/go',
      method: 'GET',
      headers: {
        Authorization: 'secret',
      },
    };
    error.config = {baseURL: 'http://test.me'};
    error.response = {
      status: 500,
      data: 'Internal Server Error',
      headers: {
        'Content-Type': 'text/html',
      },
    };
    return error;
  }

  test('wraps the cause unchanged', () => {
    const error = new Error('cause');
    const wrappedError: any = wrapApiError(error, 'message');
    expect(wrappedError).toEqual(new WError(error, 'message'));
  });

  test('wrapped error can be printed', () => {
    const error = createAxiosError('message1');
    const wrappedError: any = wrapApiError(error, 'message');
    expect(`${wrappedError}`).toEqual(
      'VError: message: API responded with status 500: Internal Server Error'
    );
    expect(JSON.stringify(wrappedError)).toMatchSnapshot();
  });

  test('includes info field for axios error', () => {
    const error = createAxiosError('message1');
    const wrappedError: any = wrapApiError(error, 'message');
    expect(wrappedError.message).toMatch(
      /message: API responded with status 500: Internal Server Error/
    );
    expect(wrappedError.request).toBeUndefined();
    expect(wrappedError.response).toBeUndefined();
    expect(wrappedError.config).toBeUndefined();
    expect(VError.info(wrappedError)).toMatchSnapshot();
  });

  test('includes info field for nested axios error', () => {
    const cause = createAxiosError('cause');
    const error = new VError(cause, 'error');
    const wrappedError: any = wrapApiError(error, 'message');
    expect(wrappedError.message).toBe('message');
    const wrappedCause: any = VError.cause(wrappedError);
    expect(wrappedCause).not.toBeUndefined();
    expect(wrappedCause.message).toBe('error: cause');
    expect(VError.cause(wrappedCause)?.message).toBe(
      'API responded with status 500: Internal Server Error'
    );
    expect(wrappedCause.request).toBeUndefined();
    expect(wrappedCause.response).toBeUndefined();
    expect(wrappedCause.config).toBeUndefined();
    expect(VError.info(wrappedCause)).toMatchSnapshot();
  });
});
