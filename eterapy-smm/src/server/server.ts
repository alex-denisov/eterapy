import type {IncomingMessage, ServerResponse} from 'node:http'
import type {PartialJsonValue} from '@devvit/web/shared'
import {Endpoint, EndpointMethod, type ErrorRsp} from '../shared/api.ts'
import {syncOnce} from './bridge.ts'

export async function onReq(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  try {
    await route(reqMsg, rspMsg)
  } catch (err) {
    console.error(
      `server error; ${err instanceof Error ? err.message : 'unknown error'}`,
    )
    writeJson<ErrorRsp>(
      500,
      {error: 'internal server error', status: 500},
      rspMsg,
    )
  }
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = reqMsg.url?.slice(1) as Endpoint
  const method = EndpointMethod[endpoint]

  let rsp: PartialJsonValue
  if (method !== reqMsg.method) {
    rsp = {error: 'not found', status: 404}
  } else {
    switch (endpoint) {
      case Endpoint.Health:
        rsp = {ok: true}
        break
      case Endpoint.SchedulerSync:
        rsp = await syncOnce()
        break
      default:
        endpoint satisfies never
        rsp = {error: 'not found', status: 404}
        break
    }
  }

  const status =
    rsp &&
    typeof rsp === 'object' &&
    !Array.isArray(rsp) &&
    'status' in rsp &&
    typeof rsp.status === 'number'
      ? rsp.status
      : 200
  writeJson<PartialJsonValue>(status, rsp, rspMsg)
}

function writeJson<T extends PartialJsonValue>(
  status: number,
  json: Readonly<T>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json)
  const len = Buffer.byteLength(body)
  rsp.writeHead(status, {
    'Content-Length': len,
    'Content-Type': 'application/json',
  })
  rsp.end(body)
}
