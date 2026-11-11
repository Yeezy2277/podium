import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
  type PipeTransform,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import type { ZodSchema } from "zod";
import { DomainError, invalid } from "../domain/errors";

/** Validates and parses a body or query with a shared Zod schema (the same one the admin form uses). */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw invalid(
        "Some fields need attention",
        r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    return r.data;
  }
}

type WithId = Request & { id?: string };

/** Every request gets an id (Vercel's when present), echoed in `x-request-id` and in error bodies. */
export function requestIdMiddleware(req: WithId, res: Response, next: NextFunction) {
  const incoming = req.headers["x-vercel-id"] ?? req.headers["x-request-id"];
  req.id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
}

export type ErrorBody = { error: string; message: string; details?: unknown; requestId: string };

const DOMAIN_STATUS: Record<DomainError["kind"], number> = { validation: 400, forbidden: 403, not_found: 404, conflict: 409 };
const HTTP_CODE: Record<number, string> = { 400: "validation", 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict" };

/** Maps anything thrown to one envelope; unknown errors are logged with the id and never echoed. */
export function toErrorBody(e: unknown, requestId: string): { status: number; body: ErrorBody } {
  if (e instanceof DomainError) {
    return {
      status: DOMAIN_STATUS[e.kind],
      body: { error: e.kind, message: e.message, ...(e.details === undefined ? {} : { details: e.details }), requestId },
    };
  }
  if (e instanceof HttpException) {
    const status = e.getStatus();
    const r = e.getResponse();
    const message = typeof r === "string" ? r : typeof (r as { message?: unknown }).message === "string" ? (r as { message: string }).message : e.message;
    return { status, body: { error: HTTP_CODE[status] ?? "http_error", message, requestId } };
  }
  return {
    status: 500,
    body: { error: "internal", message: `Something went wrong on our side. It's logged under request id ${requestId}.`, requestId },
  };
}

@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  private readonly log = new Logger("HTTP");

  catch(e: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<WithId>();
    const requestId = req.id ?? randomUUID();
    const { status, body } = toErrorBody(e, requestId);
    if (status >= 500) this.log.error(`[${requestId}] ${req.method} ${req.url}: ${e instanceof Error ? e.stack : String(e)}`);
    http.getResponse<Response>().status(status).json(body);
  }
}
