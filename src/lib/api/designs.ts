import type { UploadIntent, UploadIntentInput } from "@/lib/account/design-uploads";
import { requireCustomerContext } from "@/lib/account/identity";
import type { CustomerDesign, CustomerIdentity } from "@/lib/account/types";
import { UnauthorizedError, ValidationError } from "@/lib/errors";
import type { GeometryAnalysisResult } from "@/lib/geometry/types";
import {
  checkManufacturability,
  configuredConstraints,
} from "@/lib/manufacturing/manufacturability";
import { isAnalyzable } from "@/lib/models";

import {
  analysisDto,
  designDto,
  type DesignDetailDto,
  type UploadIntentDto,
} from "./dto";
import { readInteger, readString, requireRecord } from "./respond";

/**
 * The design API's request and response boundary.
 *
 * ── Who is asking ────────────────────────────────────────────────────────
 *
 * Every design route starts with `requireIdentity`, which asks the auth adapter
 * and nothing else. There is no route, parameter, header or body field that
 * names a customer. In a production build before Stage 17 the adapter answers
 * "nobody", and every design route answers 401 — storing a file needs an owner,
 * and inventing one would be fake authentication.
 *
 * ── What a request may say ───────────────────────────────────────────────
 *
 * An upload intent is a filename, a size and a checksum. Anything else in the
 * body is refused by name rather than ignored: a client sending `customerId`
 * or `storageKey` is either broken or probing, and either way it should hear
 * that those are not inputs. The other routes read no body at all — the design
 * id is in the path, and it is the only thing they act on.
 */

export async function requireIdentity(): Promise<CustomerIdentity> {
  const gate = await requireCustomerContext();

  if (!gate.authenticated) {
    throw new UnauthorizedError("Sign in to store and use designs.");
  }

  return gate.context.identity;
}

const INTENT_FIELDS: readonly string[] = ["fileName", "sizeBytes", "sha256"];

export function parseUploadIntent(body: unknown): UploadIntentInput {
  const record = requireRecord(body);

  const unexpected = Object.keys(record).filter((key) => !INTENT_FIELDS.includes(key));
  if (unexpected.length > 0) {
    throw new ValidationError(
      "This request contains fields that are not accepted.",
      unexpected.slice(0, 5).map((field) => ({
        field: field.slice(0, 64),
        message: "This field is not accepted.",
      })),
    );
  }

  return {
    fileName: readString(record, "fileName", { max: 512 }) ?? "",
    // Range is the service's to judge, so the limit message names the limit.
    sizeBytes: readInteger(record, "sizeBytes", { min: 0 }),
    sha256: readString(record, "sha256", { max: 64 }) ?? "",
  };
}

export function uploadIntentDto(intent: UploadIntent): UploadIntentDto {
  return {
    design: designDto(intent.design),
    upload:
      intent.status === "upload_required"
        ? {
            method: intent.upload.method,
            url: intent.upload.url,
            headers: { ...intent.upload.headers },
            expiresAt: intent.upload.expiresAt,
          }
        : null,
  };
}

/**
 * A design with its analysis.
 *
 * Manufacturability is computed now, from the stored measurements and today's
 * machine constraints, rather than stored — the constraints can change and a
 * verdict recorded last month would not.
 */
export function designDetailDto(
  design: CustomerDesign,
  analysis: GeometryAnalysisResult | null,
): DesignDetailDto {
  return {
    design: designDto(design),
    analysis: analysis
      ? analysisDto(analysis, checkManufacturability(analysis, configuredConstraints()))
      : null,
    analysisState: analysis
      ? "available"
      : isAnalyzable(design.name)
        ? "unavailable"
        : "unsupported",
  };
}
