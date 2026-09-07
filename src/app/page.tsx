import Link from "next/link";

export default function HomePage() {
  return (
    <main className="bg-hero u-container u-section">
      <p className="t-eyebrow">Digital to physical</p>
      <h1 className="t-display" style={{ marginBlock: "var(--spacing-4)" }}>
        Manufacturing,
        <br />
        reimagined.
      </h1>
      <p className="t-body-lg" style={{ maxWidth: "48ch" }}>
        Turn digital designs into physical products through advanced on-demand
        manufacturing.
      </p>
      <p style={{ marginTop: "var(--spacing-9)" }}>
        <Link href="/foundations">Design system foundations</Link>
      </p>
    </main>
  );
}
