import React from 'react';

/** Technical specifications table — label left, mono value right, hairline rows. */
export function SpecTable({ rows = [], dense, highlightKeys = [], style }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', ...style }}>
      <tbody>
        {rows.map((r, i) => {
          const hot = highlightKeys.includes(r.label);
          return (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th scope="row" style={{ textAlign: 'left', padding: dense ? '8px 0' : '12px 0', font: 'var(--type-technical-sm)',
                letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 400 }}>{r.label}</th>
              <td style={{ textAlign: 'right', padding: dense ? '8px 0' : '12px 0', font: 'var(--type-technical)',
                color: hot ? 'var(--text-accent)' : 'var(--text-primary)', letterSpacing: 'var(--ls-technical)' }}>{r.value}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
