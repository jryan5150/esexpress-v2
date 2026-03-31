import type { FastifyBaseLogger } from 'fastify';

export const loggerConfig = {
  development: {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
    },
  },
  production: true,
  staging: true,
  test: false,
};

export function getLoggerConfig(env: string): boolean | object {
  return loggerConfig[env as keyof typeof loggerConfig] ?? true;
}

// Re-export type for consumers that need it
export type { FastifyBaseLogger };
