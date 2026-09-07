"use client";

import { useState } from "react";
import clsx from "clsx";

import { Icon } from "@/components/core";
import { Checkbox } from "@/components/forms";
import styles from "./FilterTree.module.css";

export interface FilterNode {
  /** Stable identifier used in the URL and in the selected set. */
  value: string;
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children?: readonly FilterNode[];
}

export interface FilterGroup {
  /** Facet key, e.g. "category", "material". */
  key: string;
  label: string;
  defaultOpen?: boolean;
  options: readonly FilterNode[];
}

export interface FilterTreeProps {
  groups: readonly FilterGroup[];
  /** Selected node values across every group. */
  selected: readonly string[];
  onToggle: (groupKey: string, value: string) => void;
  className?: string;
}

/**
 * Nested facet navigation, up to three levels. Amazon-grade information
 * architecture on the SADA 3D surface.
 *
 * Selection is controlled by the caller so it can live in the URL; only
 * expand/collapse is local. Every control is a real button or checkbox, so the
 * tree is keyboard-operable without custom key handling.
 */
export function FilterTree({
  groups,
  selected,
  onToggle,
  className,
}: FilterTreeProps) {
  return (
    <div className={clsx(styles.tree, className)}>
      {groups.map((group) => (
        <Group
          key={group.key}
          group={group}
          selected={selected}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function Group({
  group,
  selected,
  onToggle,
}: {
  group: FilterGroup;
  selected: readonly string[];
  onToggle: FilterTreeProps["onToggle"];
}) {
  const [open, setOpen] = useState(group.defaultOpen !== false);
  const panelId = `filter-group-${group.key}`;

  return (
    <section className={clsx(styles.group, open && styles.groupOpen)}>
      <h3>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          className={styles.groupToggle}
        >
          {group.label}
          <span className={styles.groupGlyph} aria-hidden="true">
            <Icon name={open ? "minus" : "plus"} size={13} />
          </span>
        </button>
      </h3>

      <div id={panelId} className={styles.options} hidden={!open}>
        {group.options.map((node) => (
          <Node
            key={node.value}
            node={node}
            level={1}
            groupKey={group.key}
            selected={selected}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}

function Node({
  node,
  level,
  groupKey,
  selected,
  onToggle,
}: {
  node: FilterNode;
  level: number;
  groupKey: string;
  selected: readonly string[];
  onToggle: FilterTreeProps["onToggle"];
}) {
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const [open, setOpen] = useState(Boolean(node.defaultOpen));

  const checked = selected.includes(node.value);
  const descendantSelected =
    hasChildren && !checked && hasSelectedDescendant(children, selected);

  const panelId = `filter-${groupKey}-${node.value}`;

  return (
    <div className={clsx(styles.node, level > 1 && styles.nested)}>
      <div className={styles.nodeRow}>
        {hasChildren && (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.label}`}
            className={styles.disclosure}
          >
            <Icon name={open ? "chevron-down" : "chevron-right"} size={13} />
          </button>
        )}

        <Checkbox
          label={node.label}
          count={node.count}
          checked={checked}
          indeterminate={descendantSelected}
          onChange={() => onToggle(groupKey, node.value)}
          className={clsx(styles.checkbox, !hasChildren && styles.leaf)}
        />
      </div>

      {hasChildren && (
        <div id={panelId} className={styles.children} hidden={!open}>
          {children.map((child) => (
            <Node
              key={child.value}
              node={child}
              level={level + 1}
              groupKey={groupKey}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function hasSelectedDescendant(
  nodes: readonly FilterNode[],
  selected: readonly string[],
): boolean {
  return nodes.some(
    (node) =>
      selected.includes(node.value) ||
      hasSelectedDescendant(node.children ?? [], selected),
  );
}
