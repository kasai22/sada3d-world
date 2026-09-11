"use server";

import { revalidatePath } from "next/cache";

import {
  requestCustomerPasswordReset,
  signInCustomer,
  signOutCustomer,
  signUpCustomer,
  updateCustomerPassword,
  type AuthFormResult,
} from "@/lib/account/authentication";

/**
 * The sign-in boundary.
 *
 * Server actions, so credentials go from the browser to this server over the
 * page's own origin and from here to Supabase Auth; the session comes back as
 * HttpOnly cookies set on this response. Next.js refuses a server action whose
 * Origin does not match the host, which is the CSRF protection for these.
 *
 * Every argument is treated as untyped input — a server action is an HTTP
 * endpoint whatever its TypeScript signature says — and the service validates
 * it. Nothing here logs a value: not the email, not the password.
 *
 * After any change to who is signed in, every rendered page is revalidated, so
 * no server-rendered output from the previous identity is reused.
 */

type Input = Record<string, unknown>;

function record(value: unknown): Input {
  return typeof value === "object" && value !== null ? (value as Input) : {};
}

function refreshEverything(): void {
  revalidatePath("/", "layout");
}

export async function signInAction(input: unknown): Promise<AuthFormResult> {
  const body = record(input);
  const result = await signInCustomer({
    email: body.email,
    password: body.password,
    next: body.next,
  });
  if (result.ok) refreshEverything();
  return result;
}

export async function signUpAction(input: unknown): Promise<AuthFormResult> {
  const body = record(input);
  const result = await signUpCustomer({
    email: body.email,
    password: body.password,
    confirmPassword: body.confirmPassword,
    next: body.next,
  });
  if (result.ok) refreshEverything();
  return result;
}

export async function requestPasswordResetAction(input: unknown): Promise<AuthFormResult> {
  return requestCustomerPasswordReset({ email: record(input).email });
}

export async function updatePasswordAction(input: unknown): Promise<AuthFormResult> {
  const body = record(input);
  return updateCustomerPassword({
    password: body.password,
    confirmPassword: body.confirmPassword,
  });
}

export async function signOutAction(): Promise<AuthFormResult> {
  const result = await signOutCustomer();
  refreshEverything();
  return result;
}
