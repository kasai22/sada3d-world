import { Button } from "@/components/core/Button";
import { EmptyState } from "@/components/ops/EmptyState";

/** A console address that names nothing, answered inside the shell. */
export default function OpsNotFound() {
  return (
    <EmptyState
      icon="search"
      title="Nothing at this address"
      action={
        <Button href="/ops" size="sm" variant="secondary">
          Dashboard
        </Button>
      }
    >
      <p>The page or record you asked for does not exist. Use search to find it.</p>
    </EmptyState>
  );
}
