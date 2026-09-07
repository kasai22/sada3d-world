import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Checkbox } from '../forms/Checkbox.jsx';

/** Nested facet navigation (up to 3 levels). Amazon-grade information architecture,
 *  SADA 3D surface treatment. */
export function FilterTree({ groups = [], selected = [], onToggle, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {groups.map((g) => <Group key={g.label} group={g} selected={selected} onToggle={onToggle} />)}
    </div>
  );
}

function Group({ group, selected, onToggle }) {
  const [open, setOpen] = React.useState(group.defaultOpen !== false);
  return (
    <section style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: open ? 12 : 0 }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '14px 0', background: 'none', border: 0, cursor: 'pointer',
          font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
        {group.label}
        <Icon name={open ? 'minus' : 'plus'} size={13} color="var(--text-muted)" />
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {(group.options || []).map((o) => <Node key={o.label} node={o} level={1} selected={selected} onToggle={onToggle} />)}
      </div>}
    </section>
  );
}

function Node({ node, level, selected, onToggle }) {
  const [open, setOpen] = React.useState(level === 1 && node.defaultOpen);
  const kids = node.children || [];
  const checked = selected.includes(node.label);
  return (
    <div style={{ paddingLeft: level > 1 ? 14 : 0, borderLeft: level > 1 ? '1px solid var(--border-subtle)' : 0, marginLeft: level > 1 ? 4 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {kids.length > 0 && (
          <button type="button" aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)}
            style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} />
          </button>
        )}
        <Checkbox label={node.label} count={node.count} checked={checked}
          onChange={() => onToggle && onToggle(node.label)}
          style={{ flex: 1, paddingLeft: kids.length ? 0 : 22 }} />
      </div>
      {open && kids.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 4 }}>
          {kids.map((k) => <Node key={k.label} node={k} level={level + 1} selected={selected} onToggle={onToggle} />)}
        </div>
      )}
    </div>
  );
}
