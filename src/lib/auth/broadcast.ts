/**
 * Telling the other open tabs that who is signed in has changed.
 *
 * The session lives in HttpOnly cookies, so a tab cannot watch it change. When
 * this tab signs in or out, it says so on a BroadcastChannel; every other tab
 * re-renders from the server and re-reads the header's hint. The server is still
 * the only judge of the session — a message on this channel changes what a tab
 * *asks for*, never what it is allowed to see.
 *
 * Browser-only and dependency-free, so any client component may import it.
 */

export const AUTH_CHANNEL = "sada3d-auth";

/** Dispatched in this tab, where BroadcastChannel does not deliver its own messages. */
export const AUTH_CHANGED_EVENT = "sada3d:auth-changed";

export type AuthChange = "signed_in" | "signed_out" | "password_updated";

export function announceAuthChange(change: AuthChange): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: change }));

  try {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.postMessage({ change });
    channel.close();
  } catch {
    // No BroadcastChannel: other tabs catch up on focus instead.
  }
}

/** Calls `listener` for changes announced by other tabs. Returns an unsubscribe. */
export function subscribeToOtherTabs(listener: (change: AuthChange) => void): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => undefined;
  }

  const channel = new BroadcastChannel(AUTH_CHANNEL);
  channel.onmessage = (event: MessageEvent<{ change?: AuthChange }>) => {
    if (event.data?.change) listener(event.data.change);
  };

  return () => channel.close();
}
