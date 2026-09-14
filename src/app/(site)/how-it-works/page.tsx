import type { Metadata } from "next";

import { ContentIndex, PageIntro } from "@/components/content";
import { Button, Icon, Tag } from "@/components/core";
import { SectionHeading } from "@/components/structure";
import {
  ACTOR_LABEL,
  HOW_IT_WORKS_PAGE,
  PROCESS_STAGES,
  type StageActor,
} from "@/content/how-it-works";
import { published } from "@/content/pages";
import {
  CUSTOMER_STAGES,
  CUSTOMER_STAGE_LABEL,
} from "@/lib/manufacturing/types";
import { ROUTES } from "@/lib/routes";
import { SITE } from "@/lib/site";

import styles from "./page.module.css";

const { seo, intro } = HOW_IT_WORKS_PAGE;

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  alternates: { canonical: seo.path },
  robots: seo.index ? undefined : { index: false, follow: true },
  openGraph: {
    type: "website",
    url: seo.path,
    title: `${seo.title} — ${SITE.name}`,
    description: seo.description,
  },
};

/** The tone each actor's chip carries. Accent marks the stages you perform. */
const ACTOR_TONE: Record<StageActor, "accent" | "info" | "neutral"> = {
  customer: "accent",
  system: "info",
  sada: "neutral",
};

/**
 * /how-it-works
 *
 * ── What this page refuses to imply ──────────────────────────────────────
 *
 * That the process is automatic. Two of the eight stages are — an uploaded
 * file is analysed and a configuration is priced without anyone touching it —
 * and the rest are a person, either the customer or Reality 3D. Each stage says
 * which, in a chip beside its heading, because a customer reading an eight-step
 * diagram is trying to work out what is waiting on them.
 *
 * The manufacturing stage lists the real internal stages an order moves
 * through, read from `CUSTOMER_STAGES` — the same projection the order tracking
 * page renders. So this page and a live order describe the same process, and
 * they cannot drift into describing two.
 *
 * A Server Component with no client island.
 */
export default function HowItWorksPage() {
  const stages = published(PROCESS_STAGES);

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <PageIntro crumbs={[{ label: "How it works" }]} intro={intro} />

        <ContentIndex
          label="Process"
          entries={stages.map((stage) => ({
            value: stage.value,
            label: stage.name,
            meta: ACTOR_LABEL[stage.actor],
          }))}
        />

        {/* The legend. Three actors, stated once, so each chip below is read
            rather than decoded. */}
        <section className={styles.legend} aria-labelledby="legend-title">
          <h2 id="legend-title" className={styles.legendTitle}>
            Who does what
          </h2>
          <ul className={styles.legendList}>
            <li>
              <Tag tone="accent">{ACTOR_LABEL.customer}</Tag>
              <span>Waiting on you. Nothing moves until you do it.</span>
            </li>
            <li>
              <Tag tone="info">{ACTOR_LABEL.system}</Tag>
              <span>Software, unattended. No one is in the loop.</span>
            </li>
            <li>
              <Tag tone="neutral">{ACTOR_LABEL.sada}</Tag>
              <span>A person at Reality 3D. Judgement, not automation.</span>
            </li>
          </ul>
        </section>

        {/* An ordered list, because the stages happen in this order. Named,
            because "01 Choose or upload" does not say what it is one of. */}
        <ol className={styles.stages} aria-label="Process stages">
          {stages.map((stage) => (
            <li key={stage.value} id={stage.value} className={styles.stage}>
              <span className={styles.node} aria-hidden="true" />

              <div className={styles.stageHead}>
                <SectionHeading
                  as="h2"
                  size="md"
                  index={stage.index}
                  id={`${stage.value}-name`}
                >
                  {stage.name}
                </SectionHeading>

                <Tag tone={ACTOR_TONE[stage.actor]} className={styles.actor}>
                  {ACTOR_LABEL[stage.actor]}
                </Tag>
              </div>

              <div className={styles.stageBody}>
                <p className={styles.summary}>{stage.summary}</p>

                <ul className={styles.detail}>
                  {stage.detail.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>

                {/*
                  A stage's limit sits inside the stage, not in a footnote.
                  Payment is not live, STEP files are not analysed
                  automatically, and quotes are provisional — a customer who
                  discovers any of those at checkout was told too late.
                */}
                {stage.caveat && (
                  <p className={styles.caveat}>
                    <Icon name="info" size={16} className={styles.caveatIcon} />
                    <span>{stage.caveat}</span>
                  </p>
                )}

                {stage.value === "manufacture" && (
                  <div className={styles.tracking}>
                    <h3 className={styles.subhead}>
                      What you see while it is being made
                    </h3>
                    <ol className={styles.trackingList}>
                      {CUSTOMER_STAGES.map((customerStage) => (
                        <li key={customerStage}>
                          {CUSTOMER_STAGE_LABEL[customerStage]}
                        </li>
                      ))}
                    </ol>
                    <p className={styles.trackingNote}>
                      These are the stages your order actually reports. Nothing
                      is estimated: a stage appears once the part has reached it.
                    </p>
                  </div>
                )}

                {stage.href && (
                  <div className={styles.stageAction}>
                    <Button
                      href={stage.href}
                      variant="technical"
                      size="sm"
                      iconRight="arrow-right"
                    >
                      {ACTION_LABEL[stage.value] ?? "Go there"}
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        <section className={styles.cta} aria-labelledby="cta-title">
          <SectionHeading id="cta-title" size="md">
            Start at stage one
          </SectionHeading>
          <p className={styles.ctaText}>
            Browse a part that already exists, or send us a model of your own.
            Both take the same eight stages from here.
          </p>
          <div className={styles.ctaActions}>
            <Button href={ROUTES.customPrint} iconRight="arrow-right">
              Upload a model
            </Button>
            <Button href={ROUTES.shop} variant="secondary">
              Browse the catalog
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** The label for each stage's own link, where the stage has a page. */
const ACTION_LABEL: Record<string, string> = {
  "choose-or-upload": "Upload a model",
  configure: "Compare materials",
  order: "View your cart",
  ship: "Track an order",
};
