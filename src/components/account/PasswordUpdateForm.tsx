"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button, Icon } from "@/components/core";
import { Input } from "@/components/forms";
import { updatePasswordAction } from "@/app/(site)/login/actions";
import type { AuthField } from "@/lib/account/authentication";
import { signInHref } from "@/lib/account/routes";
import { announceAuthChange } from "@/lib/auth/broadcast";

import styles from "./AuthForms.module.css";

/**
 * Choosing a new password.
 *
 * Reached from a recovery link — which has already established a session — or
 * from settings while signed in. Either way the server changes the password of
 * the session it holds; this form sends the new password and nothing else, and
 * there is no field that names an account.
 */
export function PasswordUpdateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fields, setFields] = useState<Partial<Record<AuthField, string>>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "problem"; text: string } | null>(null);
  const [expired, setExpired] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setFields({});

    startTransition(async () => {
      try {
        const result = await updatePasswordAction({ password, confirmPassword });
        setPassword("");
        setConfirmPassword("");

        if (result.ok) {
          announceAuthChange("password_updated");
          setNotice({
            tone: "success",
            text: "message" in result ? result.message : "Your password has been changed.",
          });
          router.refresh();
          return;
        }

        setExpired(result.status === "no_session");
        setFields(result.fields ?? {});
        setNotice({ tone: "problem", text: result.message });
      } catch {
        setNotice({
          tone: "problem",
          text: "The request could not be sent. Check your connection and try again.",
        });
      }
    });
  }

  return (
    <div className={styles.panel}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <h1 className={styles.heading}>Choose a new password</h1>
        <p className={styles.intro}>Use at least 8 characters. You stay signed in on this device.</p>

        {notice && (
          <p className={styles.notice} data-tone={notice.tone} role={notice.tone === "problem" ? "alert" : "status"}>
            <Icon name={notice.tone === "problem" ? "error" : "check-circle"} size={16} />
            <span>{notice.text}</span>
          </p>
        )}

        {notice?.tone === "success" ? (
          <Button href="/account" size="lg" iconRight="arrow-right">
            Go to your account
          </Button>
        ) : expired ? (
          <Button href={signInHref(undefined, { mode: "forgot" })} size="lg">
            Request a new link
          </Button>
        ) : (
          <>
            <Input
              label="New password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={fields.password}
              disabled={pending}
            />
            <Input
              label="Confirm new password"
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              error={fields.confirmPassword}
              disabled={pending}
            />
            <Button type="submit" size="lg" fullWidth loading={pending}>
              Change password
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
