import React from 'react';
import { Icon } from '../core/Icon.jsx';

const LINKS = ['Shop', 'Custom Print', 'Materials', 'Solutions', 'How It Works'];

/** Sticky platform header. Wordmark left, five links centred, utilities right. */
export function Header({ active = 'Shop', links = LINKS, cartCount = 0, onNavigate, sticky = true, style }) {
  return (
    <header style={{ position: sticky ? 'sticky' : 'static', top: 0, zIndex: 200, height: 'var(--header-height)',
      display: 'flex', alignItems: 'center', gap: 32, padding: '0 32px',
      background: 'rgba(5,5,6,.82)', backdropFilter: 'var(--blur-header)', WebkitBackdropFilter: 'var(--blur-header)',
      borderBottom: '1px solid var(--border-subtle)', ...style }}>
      <a href="#" onClick={(e) => { e.preventDefault(); onNavigate && onNavigate('Home'); }}
        style={{ display: 'flex', alignItems: 'baseline', gap: 2, borderBottom: 0,
          fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-semibold)', fontSize: 17, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
        <span style={{ color: 'var(--text-primary)' }}>SADA</span><span style={{ color: 'var(--text-accent)' }}>3D</span>
      </a>
      <nav style={{ display: 'flex', gap: 4, marginLeft: 12, flex: 1 }}>
        {links.map((l) => {
          const on = l === active;
          return (
            <a key={l} href="#" onClick={(e) => { e.preventDefault(); onNavigate && onNavigate(l); }}
              style={{ position: 'relative', padding: '0 14px', height: 'var(--header-height)', display: 'flex', alignItems: 'center',
                borderBottom: 0, font: 'var(--type-ui)', letterSpacing: 'var(--ls-interface)',
                color: on ? 'var(--text-primary)' : 'var(--text-secondary)', transition: 'var(--transition-control)' }}>
              {l}
              <span aria-hidden="true" style={{ position: 'absolute', left: 14, right: 14, bottom: 0, height: 2,
                background: 'var(--gradient-orange-line)', boxShadow: 'var(--glow-line)',
                transform: on ? 'scaleX(1)' : 'scaleX(0)', transformOrigin: 'left', transition: 'var(--transition-line)' }} />
            </a>
          );
        })}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {[['search', 'Search'], ['user', 'Account']].map(([ic, lb]) => (
          <button key={ic} type="button" aria-label={lb} onClick={() => onNavigate && onNavigate(lb)}
            style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none',
              border: 0, color: 'var(--text-secondary)', cursor: 'pointer' }}><Icon name={ic} size={17} /></button>
        ))}
        <button type="button" aria-label="Cart" onClick={() => onNavigate && onNavigate('Cart')}
          style={{ position: 'relative', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 0, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <Icon name="shopping-bag" size={17} />
          {cartCount > 0 && <span style={{ position: 'absolute', top: 6, right: 4, minWidth: 15, height: 15, padding: '0 3px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--orange-500)', color: 'var(--text-on-accent)',
            font: 'var(--fw-bold) 9px/1 var(--font-technical)', borderRadius: 'var(--radius-xs)' }}>{cartCount}</span>}
        </button>
      </div>
    </header>
  );
}
