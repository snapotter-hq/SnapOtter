export const PLAYWRIGHT_BACKING_STATE_POOLS: string[];

export interface PlaywrightBackingState {
  readonly bullmqPrefix: string;
  readonly databaseName: string;
  readonly databaseUrl: string;
  readonly postgresBaseUrl: string;
  readonly redisUrl: string;
  readonly runId: string;
  readonly scope: string;
}

export interface PlaywrightBackingStateDriver {
  deleteRedisKeys(
    state: PlaywrightBackingState,
    ownsKey: (key: string) => boolean,
  ): Promise<unknown>;
  dropDatabase(state: PlaywrightBackingState): Promise<unknown>;
}

export function resolvePlaywrightBackingState(options: {
  postgresBaseUrl: string;
  redisUrl: string;
  runId: string;
  scope: string;
}): PlaywrightBackingState;

export function ownsPlaywrightRedisKey(state: PlaywrightBackingState, key: string): boolean;

export function teardownPlaywrightBackingState(
  state: PlaywrightBackingState,
  driver?: PlaywrightBackingStateDriver,
): Promise<void>;
