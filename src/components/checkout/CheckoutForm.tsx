"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button, Icon } from "@/components/core";
import { Input, Select } from "@/components/forms";
import { CartSummary } from "@/components/cart";
import { placeOrderAction } from "@/app/(site)/checkout/actions";
import { CART_CHANGED_EVENT } from "@/lib/cart/intent";
import { formatINR } from "@/lib/money";
import type { PricedCart } from "@/lib/cart/types";
import {
  EMPTY_ADDRESS,
  EMPTY_CONTACT,
  INDIA_STATES,
  SUPPORTED_COUNTRIES,
  type Contact,
  type FieldError,
  type ShippingAddress,
} from "@/lib/checkout/types";
import styles from "./CheckoutForm.module.css";

export interface CheckoutFormProps {
  cart: PricedCart;
  /** True when the only payment adapter available takes no money. */
  developmentPayment: boolean;
}

type Errors = Record<string, string>;

function toMap(errors: readonly FieldError[]): Errors {
  return Object.fromEntries(errors.map((error) => [error.field, error.message]));
}

/**
 * Checkout.
 *
 * Fields are the design system's large size throughout. The default 40 px
 * control is below the 44 px touch target this project holds itself to, and a
 * payment form is the last place to be economical about how easy something is
 * to hit.
 *
 * One page, two columns, one submit. A five-step wizard would add ceremony to a
 * form that fits on a screen; the order of the sections is the order the
 * information is needed.
 *
 * Every figure shown here came from the server with the cart. This component
 * collects a name, an address and a phone number, and asks the server to place
 * the order — it never computes a total, and the total it displays is not the
 * one the order is charged against. That one is recomputed server-side.
 */
export function CheckoutForm({ cart, developmentPayment }: CheckoutFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [address, setAddress] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<{
    title: string;
    messages: readonly string[];
    recover?: "cart" | "retry";
  } | null>(null);

  const field = (name: string) => errors[name];

  /** Moves focus to the first field the server rejected. */
  function focusFirstError(map: Errors): void {
    const first = Object.keys(map)[0];
    if (!first) return;

    const input = formRef.current?.querySelector<HTMLElement>(
      `[data-field="${CSS.escape(first)}"] input, [data-field="${CSS.escape(first)}"] select`,
    );
    input?.focus();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending) return;

    setErrors({});
    setProblem(null);

    startTransition(async () => {
      const result = await placeOrderAction({ contact, address });

      switch (result.status) {
        case "placed":
          // The cart became an order; the header count follows.
          window.dispatchEvent(new Event(CART_CHANGED_EVENT));
          router.push("/checkout/success");
          return;

        case "invalid": {
          const map = toMap(result.errors);
          setErrors(map);
          focusFirstError(map);
          return;
        }

        case "cart_invalid":
          setProblem({
            title: "Your cart changed.",
            messages: result.messages,
            recover: "cart",
          });
          return;

        case "payment_failed":
          setProblem({
            title: result.message,
            messages: [],
            recover: "retry",
          });
          return;

        default:
          setProblem({
            title: "We couldn't place the order.",
            messages: [result.message],
            recover: "retry",
          });
      }
    });
  }

  return (
    <form ref={formRef} className={styles.layout} onSubmit={onSubmit} noValidate>
      {/* ---- contact ---- */}
      <section className={styles.contact} aria-labelledby="checkout-contact">
        <h2 className={styles.sectionTitle} id="checkout-contact">
          Contact
        </h2>

        <div className={styles.fields}>
          <div data-field="contact.name" className={styles.wide}>
            <Input
              size="lg"
              label="Full name"
              autoComplete="name"
              required
              value={contact.name}
              error={field("contact.name")}
              onChange={(event) =>
                setContact({ ...contact, name: event.target.value })
              }
            />
          </div>

          <div data-field="contact.email">
            <Input
              size="lg"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              hint="Where the order confirmation is sent."
              value={contact.email}
              error={field("contact.email")}
              onChange={(event) =>
                setContact({ ...contact, email: event.target.value })
              }
            />
          </div>

          <div data-field="contact.phone">
            <Input
              size="lg"
              label="Phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              hint="10-digit Indian mobile number."
              value={contact.phone}
              error={field("contact.phone")}
              onChange={(event) =>
                setContact({ ...contact, phone: event.target.value })
              }
            />
          </div>
        </div>
      </section>

      {/* ---- shipping ---- */}
      <section className={styles.shipping} aria-labelledby="checkout-shipping">
        <h2 className={styles.sectionTitle} id="checkout-shipping">
          Shipping address
        </h2>

        <div className={styles.fields}>
          <div data-field="address.line1" className={styles.wide}>
            <Input
              size="lg"
              label="Address"
              autoComplete="address-line1"
              required
              value={address.line1}
              error={field("address.line1")}
              onChange={(event) =>
                setAddress({ ...address, line1: event.target.value })
              }
            />
          </div>

          <div data-field="address.line2" className={styles.wide}>
            <Input
              size="lg"
              label="Apartment, floor, landmark"
              autoComplete="address-line2"
              value={address.line2 ?? ""}
              onChange={(event) =>
                setAddress({ ...address, line2: event.target.value })
              }
            />
          </div>

          <div data-field="address.city">
            <Input
              size="lg"
              label="City"
              autoComplete="address-level2"
              required
              value={address.city}
              error={field("address.city")}
              onChange={(event) =>
                setAddress({ ...address, city: event.target.value })
              }
            />
          </div>

          <div data-field="address.state">
            <Select
              size="lg"
              label="State"
              autoComplete="address-level1"
              required
              placeholder="Select a state"
              options={INDIA_STATES.map((state) => ({
                value: state.code,
                label: state.label,
              }))}
              value={address.state}
              error={field("address.state")}
              onChange={(event) =>
                setAddress({ ...address, state: event.target.value })
              }
            />
          </div>

          <div data-field="address.postalCode">
            <Input
              size="lg"
              label="PIN code"
              inputMode="numeric"
              autoComplete="postal-code"
              required
              technical
              maxLength={6}
              value={address.postalCode}
              error={field("address.postalCode")}
              onChange={(event) =>
                setAddress({ ...address, postalCode: event.target.value })
              }
            />
          </div>

          <div data-field="address.country">
            <Select
              size="lg"
              label="Country"
              autoComplete="country"
              required
              options={SUPPORTED_COUNTRIES.map((country) => ({
                value: country.code,
                label: country.label,
              }))}
              value={address.country}
              error={field("address.country")}
              hint="Reality 3D ships within India."
              onChange={(event) =>
                setAddress({ ...address, country: event.target.value })
              }
            />
          </div>
        </div>
      </section>

      {/* ---- summary: between shipping and payment on mobile ---- */}
      <div className={styles.summary}>
        <CartSummary
          totals={cart.totals}
          action={
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={pending}
              disabled={pending}
            >
              {pending ? "Processing order" : "Place order"}
            </Button>
          }
        />
      </div>

      {/* ---- payment ---- */}
      <section className={styles.payment} aria-labelledby="checkout-payment">
        <h2 className={styles.sectionTitle} id="checkout-payment">
          Payment
        </h2>

        {developmentPayment ? (
          /*
           * Said plainly rather than dressed up. A checkout that looks like it
           * takes payment while taking none is the one thing this page must
           * never do.
           */
          <p className={styles.notice}>
            <Icon name="info" size={15} />
            <span>
              No payment provider is connected. Placing this order records it and
              takes no money. Card payment is enabled when the provider is
              configured.
            </span>
          </p>
        ) : (
          <p className={styles.notice}>
            <Icon name="info" size={15} />
            <span>Payment is taken after the order is confirmed.</span>
          </p>
        )}

        <p className={styles.total}>
          <span className={styles.totalLabel}>Payable now</span>
          <span className={styles.totalValue}>{formatINR(cart.totals.total)}</span>
        </p>
      </section>

      {/* ---- failures ---- */}
      <div className={styles.problem}>
        {/* role="alert" is the live region. Wrapping it in a second one makes
            assistive technology announce the same failure twice. */}
        {problem && (
          <div className={styles.problemBox} role="alert">
            <h3 className={styles.problemTitle}>
              <Icon name="alert" size={16} />
              {problem.title}
            </h3>
            {problem.messages.length > 0 && (
              <ul className={styles.problemList}>
                {problem.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
            {problem.recover === "cart" && (
              <Button variant="secondary" size="sm" href="/cart">
                Review cart
              </Button>
            )}
            {problem.recover === "retry" && (
              <p className={styles.problemNote}>
                Your cart has not changed. You can try again.
              </p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
