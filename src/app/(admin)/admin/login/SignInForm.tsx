"use client";

import { useActionState } from "react";

import { Button } from "@/components/core/Button";
import { Icon } from "@/components/core/Icon";
import { Input } from "@/components/forms/Input";

import { signInAction, type SignInState } from "./actions";
import styles from "./login.module.css";

export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {});

  return (
    <form action={action} className={styles.form} noValidate>
      <input type="hidden" name="redirect" value={redirectTo} />
      <Input
        name="email"
        type="email"
        label="Email"
        autoComplete="username"
        required
        defaultValue={state.email ?? ""}
        autoFocus
      />
      <Input name="password" type="password" label="Password" autoComplete="current-password" required />

      {state.error && (
        <p className={styles.error} role="alert">
          <Icon name="error" size={16} />
          <span>{state.error}</span>
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" disabled={pending} loading={pending} fullWidth iconRight="arrow-right">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
