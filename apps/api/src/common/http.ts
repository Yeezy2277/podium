import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";
import type { Response } from "express";
import type { ZodSchema } from "zod";
import { DomainError } from "../domain/errors";

/** Validates and parses a body or query with a shared Zod schema (the same one the admin form uses). */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        error: "validation",
        message: "Some fields need attention",
        fields: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return r.data;
  }
}

const STATUS: Record<DomainError["kind"], number> = { validation: 400, forbidden: 403, not_found: 404, conflict: 409 };

/** Domain errors → HTTP, with a stable `{ error, message, details }` shape the admin can render. */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(e: DomainError, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(STATUS[e.kind])
      .json({ error: e.kind, message: e.message, details: e.details });
  }
}

