"use server";

import { redirect } from "next/navigation";

import { currentOperator } from "@/lib/ops/operator";
import { safeOpsPath } from "@/lib/ops/routes";

export interface SignInState {
  error?: string;
  email?: string;
}

const MAX_EMAIL = 254;
const MAX_PASSWORD = 1024;

/** Payload's error classes carry an HTTP status; that is the stable part to read. */
function statusOf(error: unknown): number | undefined {
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  return typeof status === "number" ? status : undefined;
}

/**
 * Signs an operator in to Reality 3D Admin.
 *
 * The sign-in itself is Payload's: `login` from `@payloadcms/next/auth` runs
 * Payload's login operation — password check, the lockout after five failures
 * (`Users.auth`), the session — and sets Payload's own cookie. Nothing about
 * operator identity is reimplemented here; this is a Reality 3D form in front
 * of it.
 *
 * Already signed in? Nothing to do but go back. The return path is validated
 * with `safeOpsPath`, so it can only ever lead into the admin.
 */
export async function signInAction(_previous: SignInState, form: FormData): Promise<SignInState> {
  const returnTo = safeOpsPath(form.get("redirect"));
  if (await currentOperator()) redirect(returnTo);

  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email address and password.", email };
  if (email.length > MAX_EMAIL || password.length > MAX_PASSWORD || !email.includes("@")) {
    return { error: "The email address or password is incorrect.", email };
  }

  try {
    const [{ login }, { default: config }] = await Promise.all([
      import("@payloadcms/next/auth"),
      import("@payload-config"),
    ]);
    await login({ collection: "users", config, email, password });
  } catch (error) {
    const status = statusOf(error);
    if (status === 423) {
      return {
        error: "This operator account is locked after repeated failed attempts. Wait 15 minutes, or ask another operator to unlock it in Advanced CMS.",
        email,
      };
    }
    if (status === 401 || status === 400 || status === 403) {
      return { error: "The email address or password is incorrect.", email };
    }
    console.error("[sada3d] operator sign-in failed", error);
    return { error: "Sign-in is unavailable right now — the CMS could not be reached. Try again in a moment.", email };
  }

  redirect(returnTo);
}
