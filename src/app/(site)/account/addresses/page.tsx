import type { Metadata } from "next";

import { AccountShell, AccountSignInRequired, AddressBook } from "@/components/account";
import { listCustomerAddresses } from "@/lib/account/addresses";
import { requireCustomerContext } from "@/lib/account/identity";

export const metadata: Metadata = {
  title: "Your addresses",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * Delivery addresses.
 *
 * The list is resolved on the server and passed down as views with the owner id
 * removed. The book itself is a client component because adding, editing,
 * removing and re-defaulting are interactions — but every one of those calls a
 * server action that resolves the customer again from the auth adapter.
 */
export default async function AccountAddressesPage() {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) {
    return <AccountSignInRequired returnTo="/account/addresses" />;
  }

  const addresses = await listCustomerAddresses(gate.context.identity);

  return (
    <AccountShell
      title="Addresses"
      description="Where your orders are delivered. Reality 3D ships within India."
      crumbs={[{ label: "Addresses" }]}
    >
      <AddressBook addresses={addresses} />
    </AccountShell>
  );
}
