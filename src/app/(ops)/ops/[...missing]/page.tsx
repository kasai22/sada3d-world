import { notFound } from "next/navigation";

import { requireOperator } from "@/lib/ops/operator";

/**
 * Any other console path. Checked like every page — an unknown address must not
 * be a way to learn whether someone is signed in — then answered as not found,
 * inside the shell, with a 404.
 */
export default async function MissingOpsPage() {
  await requireOperator("/ops");
  notFound();
}
