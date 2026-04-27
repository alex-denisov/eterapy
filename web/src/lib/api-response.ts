import { NextResponse } from "next/server";
import { REQUEST_ID_HEADER, CORRELATION_ID_HEADER } from "@/lib/request-context";

export function jsonWithRequestContext<T extends object>(
  body: T,
  init: ResponseInit | undefined,
  context: { requestId: string; correlationId?: string }
) {
  const response = NextResponse.json(
    {
      ...body,
      requestId: context.requestId,
    },
    init
  );
  response.headers.set(REQUEST_ID_HEADER, context.requestId);
  response.headers.set(CORRELATION_ID_HEADER, context.correlationId ?? context.requestId);
  return response;
}

export function errorWithRequestContext(
  code: string,
  message: string,
  status: number,
  context: { requestId: string; correlationId?: string }
) {
  return jsonWithRequestContext({ error: message, code }, { status }, context);
}
