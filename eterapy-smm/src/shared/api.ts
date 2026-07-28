export type ErrorRsp = {error: string; status: number}

export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  Health: 'api/health',
  SchedulerSync: 'internal/scheduler/sync',
} as const

export const EndpointMethod = {
  [Endpoint.Health]: 'GET',
  [Endpoint.SchedulerSync]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}
