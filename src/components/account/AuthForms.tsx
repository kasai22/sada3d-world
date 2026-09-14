"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button, Icon } from "@/components/core";
import { Input } from "@/components/forms";
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
} from "@/app/(site)/login/actions";
import type { AuthField, AuthFormResult } from "@/lib/account/authentication";
import type { LoginMode, LoginStatus } from "@/lib/account/routes";
import { announceAuthChange } from "@/lib/auth/broadcast";
import { CART_CHANGED_EVENT } from "@/lib/cart/intent";

import styles from "./AuthForms.module.css";

export interface AuthFormsProps {
  initialMode: LoginMode;
  /** Already validated by the page. */
  next?: string;
  status?: LoginStatus;
}

const STATUS_NOTICE: Record<LoginStatus, { tone: "info" | "success" | "problem"; text: string }> = {
  expired: { tone: "info", text: "Your session expired. Sign in again to continue." },
  link_invalid: {
    tone: "problem",
    text: "That link has expired or was already used. Request a new one, or sign in.",
  },
  signed_out: { tone: "info", text: "You have been signed out." },
  password_updated: { tone: "success", text: "Your password has been changed. Sign in with it." },
};

const MODES: readonly { id: LoginMode; label: string }[] = [
  { id: "signin", label: "Sign in" },
  { id: "signup", label: "Create account" },
  { id: "forgot", label: "Forgot password" },
];

type Notice = { tone: "info" | "success" | "problem"; text: string };

/**
 * Sign in, create an account, recover a password.
 *
 * Three forms behind one set of tabs, each calling a server action. What this
 * component shows is exactly what the server answered:
 *
 *   signed_in              only when the provider issued a session — then the
 *                          page moves on and every tab re-renders
 *   confirmation_required  the account needs its emailed link first; nothing
 *                          here claims the customer is signed in
 *   reset_requested        the same sentence whether or not the address exists
 *   an error               the service's sentence, and field errors beside the
 *                          fields that caused them
 *
 * No value is stored in the browser. Passwords leave this component only as the
 * action's argument and are cleared from state after every attempt.
 */
export function AuthForms({ initialMode, next, status }: AuthFormsProps) {
  const router = useRouter();
  const tabsId = useId();
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fields, setFields] = useState<Partial<Record<AuthField, string>>>({});
  const [notice, setNotice] = useState<Notice | null>(status ? STATUS_NOTICE[status] : null);

  function switchMode(target: LoginMode) {
    setMode(target);
    setFields({});
    setNotice(null);
    setPassword("");
    setConfirmPassword("");
  }

  function apply(result: AuthFormResult) {
    setPassword("");
    setConfirmPassword("");

    if (result.ok && result.status === "signed_in") {
      announceAuthChange("signed_in");
      // The guest cart was merged into the account on the server.
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
      setNotice({ tone: "success", text: "Signed in." });
      router.replace(result.next);
      router.refresh();
      return;
    }

    if (result.ok) {
      setFields({});
      setNotice({ tone: "success", text: result.message });
      return;
    }

    setFields(result.fields ?? {});
    setNotice({ tone: "problem", text: result.message });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setFields({});

    startTransition(async () => {
      try {
        const result =
          mode === "signin"
            ? await signInAction({ email, password, next })
            : mode === "signup"
              ? await signUpAction({ email, password, confirmPassword, next })
              : await requestPasswordResetAction({ email });
        apply(result);
      } catch {
        setNotice({
          tone: "problem",
          text: "The request could not be sent. Check your connection and try again.",
        });
      }
    });
  }

  const submitLabel =
    mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link";

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label="Account access">
        {MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`${tabsId}-${entry.id}`}
            aria-selected={mode === entry.id}
            aria-controls={`${tabsId}-panel`}
            className={styles.tab}
            onClick={() => switchMode(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <form
        id={`${tabsId}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${mode}`}
        className={styles.form}
        onSubmit={onSubmit}
        noValidate
      >
        <p className={styles.intro}>
          {mode === "signin"
            ? "Sign in with the email and password for your Reality 3D account."
            : mode === "signup"
              ? "Create an account to store designs, order custom parts and follow production."
              : "Enter your account email and we will send a link to choose a new password."}
        </p>

        {notice && (
          <p
            className={styles.notice}
            data-tone={notice.tone}
            role={notice.tone === "problem" ? "alert" : "status"}
          >
            <Icon
              name={notice.tone === "problem" ? "error" : notice.tone === "success" ? "check-circle" : "info"}
              size={16}
            />
            <span>{notice.text}</span>
          </p>
        )}

        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fields.email}
          disabled={pending}
        />

        {mode !== "forgot" && (
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fields.password}
            hint={mode === "signup" ? "At least 8 characters." : undefined}
            disabled={pending}
          />
        )}

        {mode === "signup" && (
          <Input
            label="Confirm password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={fields.confirmPassword}
            disabled={pending}
          />
        )}

        <Button type="submit" size="lg" fullWidth loading={pending}>
          {submitLabel}
        </Button>

        {mode === "signin" && (
          <button type="button" className={styles.link} onClick={() => switchMode("forgot")}>
            Forgot your password?
          </button>
        )}
      </form>
    </div>
  );
}
