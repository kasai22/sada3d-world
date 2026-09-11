"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";

import { Icon } from "@/components/core";
import {
  AUTH_CHANGED_EVENT,
  subscribeToOtherTabs,
} from "@/lib/auth/broadcast";

import styles from "./Header.module.css";

/** Mirrors `SESSION_HINT_COOKIE`; that module is server-side and not imported here. */
const HINT_COOKIE = "sada3d_session";

function readHint(): boolean {
  if (typeof document === "undefined") return false;
  return new RegExp(`(?:^|;\\s*)${HINT_COOKIE}=1(?:;|$)`).test(document.cookie);
}

export interface AccountLinkProps {
  /**
   * True when this build has the development identity — no Supabase, not
   * production — so the account is always "signed in" and there is no hint.
   */
  development?: boolean;
  className?: string;
}

/**
 * The header's account control: "Account" when signed in, "Sign in" when not.
 *
 * Read from a non-secret hint cookie the server writes beside the session, so
 * no page has to become dynamic to draw one link. It is a label, not a gate:
 * a wrong hint sends someone to /account, which checks the real session and
 * shows sign-in if there is none. Nothing about the customer is shown here.
 *
 * When another tab signs in or out, this re-renders the page from the server,
 * which is what actually changes what the tab can see.
 */
export function AccountLink({ development = false, className }: AccountLinkProps) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(development);

  useEffect(() => {
    if (development) return;

    const sync = () => setSignedIn(readHint());
    sync();

    const unsubscribe = subscribeToOtherTabs(() => {
      sync();
      router.refresh();
    });

    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      unsubscribe();
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [development, router]);

  const label = signedIn ? "Account" : "Sign in";

  return (
    <Link
      href={signedIn ? "/account" : "/login"}
      className={clsx("u-plain", styles.utilityLink, className)}
      aria-label={label}
      title={label}
    >
      <span className={styles.utility}>
        <Icon name="user" size={17} />
      </span>
    </Link>
  );
}
