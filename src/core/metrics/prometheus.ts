import type { NextFunction, Request, Response } from 'express';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

type HttpMetricLabels = 'method' | 'status_code' | 'route';
type GrpcMetricLabels = 'method' | 'status_code';

const register = new Registry();
const METRICS_ROUTE = '/metrics';
const UNMATCHED_ROUTE_LABEL = 'unmatched';

let initialized = false;
let httpRequestsTotal: Counter<HttpMetricLabels> | null = null;
let httpRequestDurationSeconds: Histogram<HttpMetricLabels> | null = null;
let grpcRequestsTotal: Counter<GrpcMetricLabels> | null = null;
let grpcRequestDurationSeconds: Histogram<GrpcMetricLabels> | null = null;

const initializeMetrics = (): void => {
  if (initialized) {
    return;
  }

  collectDefaultMetrics({ register });

  httpRequestsTotal = new Counter<HttpMetricLabels>({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'status_code', 'route'],
    registers: [register],
  });

  httpRequestDurationSeconds = new Histogram<HttpMetricLabels>({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'status_code', 'route'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [register],
  });

  grpcRequestsTotal = new Counter<GrpcMetricLabels>({
    name: 'grpc_requests_total',
    help: 'Total number of gRPC requests',
    labelNames: ['method', 'status_code'],
    registers: [register],
  });

  grpcRequestDurationSeconds = new Histogram<GrpcMetricLabels>({
    name: 'grpc_request_duration_seconds',
    help: 'Duration of gRPC requests in seconds',
    labelNames: ['method', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [register],
  });

  initialized = true;
};

const getHttpMetrics = (): {
  requestCounter: Counter<HttpMetricLabels>;
  requestDurationHistogram: Histogram<HttpMetricLabels>;
} => {
  initializeMetrics();

  if (!httpRequestsTotal || !httpRequestDurationSeconds) {
    throw new Error('Prometheus metrics are not initialized');
  }

  return {
    requestCounter: httpRequestsTotal,
    requestDurationHistogram: httpRequestDurationSeconds,
  };
};

export const getGrpcMetrics = (): {
  requestCounter: Counter<GrpcMetricLabels>;
  requestDurationHistogram: Histogram<GrpcMetricLabels>;
} => {
  initializeMetrics();

  if (!grpcRequestsTotal || !grpcRequestDurationSeconds) {
    throw new Error('Prometheus metrics are not initialized');
  }

  return {
    requestCounter: grpcRequestsTotal,
    requestDurationHistogram: grpcRequestDurationSeconds,
  };
};

export const initPrometheusMetrics = (): void => {
  initializeMetrics();
};

export const prometheusMetricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.path === METRICS_ROUTE) {
    next();
    return;
  }

  const { requestCounter, requestDurationHistogram } = getHttpMetrics();
  const stopTimer = requestDurationHistogram.startTimer();

  res.on('finish', () => {
    const routePath = (req.route as { path?: unknown } | undefined)?.path;
    const route =
      typeof routePath === 'string'
        ? `${req.baseUrl.replace(/\/+$/, '')}${routePath}`
        : UNMATCHED_ROUTE_LABEL;

    const labels = {
      method: req.method,
      status_code: String(res.statusCode),
      route: route || '/',
    };

    requestCounter.inc(labels);
    stopTimer(labels);
  });

  next();
};

export const prometheusMetricsHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.send(metrics);
  } catch (error) {
    next(error);
  }
};
