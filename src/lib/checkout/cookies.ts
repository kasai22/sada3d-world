/**
 * Checkout cookie names.
 *
 * Their own module because a "use server" file may only export async
 * functions, and both the action that writes this and the page that reads it
 * need the same name.
 */

/**
 * Carries the order reference from the action that placed the order to the
 * confirmation page. HttpOnly, and never in the URL: a reference in a link is
 * a reference in a referrer header, a history entry and a bookmark.
 */
export const ORDER_COOKIE = "sada3d_order";

/** Long enough to read a confirmation, short enough not to linger. */
export const ORDER_COOKIE_MAX_AGE = 60 * 60;
