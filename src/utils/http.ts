import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import Bottleneck from 'bottleneck';
import logger from './logger';

const defaultLimiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200,
});

export function createHttpClient(
  baseURL: string,
  config: AxiosRequestConfig = {},
  limiter: Bottleneck = defaultLimiter
): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 30000,
    ...config,
  });

  client.interceptors.request.use((req) => {
    logger.debug(`HTTP ${req.method?.toUpperCase()} ${req.baseURL}${req.url}`);
    return req;
  });

  client.interceptors.response.use(
    (res) => res,
    (error) => {
      if (error.response) {
        logger.error(`HTTP ${error.response.status} from ${error.config?.url}: ${JSON.stringify(error.response.data).slice(0, 500)}`);
      } else {
        logger.error(`HTTP error: ${error.message}`);
      }
      throw error;
    }
  );

  const originalGet = client.get.bind(client);
  const originalPost = client.post.bind(client);

  client.get = ((url: string, cfg?: AxiosRequestConfig) =>
    limiter.schedule(() => originalGet(url, cfg))) as typeof client.get;

  client.post = ((url: string, data?: unknown, cfg?: AxiosRequestConfig) =>
    limiter.schedule(() => originalPost(url, data, cfg))) as typeof client.post;

  return client;
}
