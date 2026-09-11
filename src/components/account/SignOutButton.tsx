"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/core";
import { signOutAction } from "@/app/(site)/login/actions";
import { signInHref } from "@/lib/account/routes";
import { announceAuthChange } from "@/lib/auth/broadcast";
import { CART_CHANGED_EVENT } from "@/lib/cart/intent";

export interface SignOutButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/**
 * Signs this browser out.
 *
 * The server revokes the session at the provider and deletes the cookies; the
 * page then leaves the account and every open tab re-renders from the server.
 * Hiding account UI is the consequence, not the mechanism — after this, every
 * account page, design route and order read refuses on the server.
 */
export function SignOutButton({ variant = "ghost", size = "sm", className }: SignOutButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function signOut() {
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await signOutAction();
        if (!result.ok) {
          setFailed(true);
          return;
        }
        announceAuthChange("signed_out");
        window.dispatchEvent(new Event(CART_CHANGED_EVENT));
        router.replace(signInHref(undefined, { status: "signed_out" }));
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <Button
      variant={variant}
      size={size}
      iconLeft="log-out"
      loading={pending}
      onClick={signOut}
      className={className}
      aria-describedby={failed ? "sign-out-failed" : undefined}
    >
      {failed ? "Sign out failed — retry" : "Sign out"}
    </Button>
  );
}
