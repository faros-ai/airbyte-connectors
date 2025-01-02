import {AxiosError, AxiosRequestConfig, AxiosResponse} from 'axios';
import stream from 'stream';
import {VError, WError} from 'verror';

function formatMessageData(data: any): any {
  return data instanceof stream.Readable ? '[Stream]' : data;
}

function formatRequest(req: AxiosRequestConfig): unknown {
  return {
    baseUrl: req?.baseURL,
    url: req?.url,
    method: req?.method,
    params: req?.params,
  };
}

function formatResponse(res: AxiosResponse): unknown {
  return {
    status: res.status,
    headers: res.headers,
    data: formatMessageData(res.data),
  };
}

function isAxiosError(error: Error): error is AxiosError {
  return (error as any).isAxiosError;
}

/** Strips verbose properties that libraries like Axios attach to errors */
export function wrapApiError(error: Error, message?: string): Error {
  if (!isAxiosError(error)) {
    const cause = VError.cause(error);
    if (cause) {
      // Wrap the cause recursively since it could contain an Axios error
      error = new WError(wrapApiError(cause), error.message);
    }
    return message ? new WError(error, message) : error;
  }

  const prefix = message ? `${message}: ` : '';
  const res: AxiosResponse<any, any> | undefined = error.response;
  const info = {
    req:
      error.config || error.request
        ? formatRequest({...error.config, ...error.request})
        : undefined,
    res: res ? formatResponse(res) : undefined,
  };
  if (!res) {
    return new VError(
      {info},
      '%sAPI request failed: %s',
      prefix,
      error.message
    );
  }
  const {data, status} = res;
  let msg = `${prefix}API responded with status ${status}`;
  const causeMsg = typeof data == 'string' ? data : data?.error?.message;
  if (causeMsg) {
    msg += `: ${causeMsg}`;
  }
  return new VError({info}, msg);
}
