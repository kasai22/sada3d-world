import React from 'react';
import { IconButton } from '../core/IconButton.jsx';

const FACES = [
  { t: 'translateZ(var(--d))' }, { t: 'rotateY(180deg) translateZ(var(--d))' },
  { t: 'rotateY(90deg) translateZ(var(--d))' }, { t: 'rotateY(-90deg) translateZ(var(--d))' },
  { t: 'rotateX(90deg) translateZ(var(--d))' }, { t: 'rotateX(-90deg) translateZ(var(--d))' },
];

function Slab({ size, depth, offset, highlight, muted, label }) {
  return (
    <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d',
      transform: `translateY(${offset}px)`, transition: 'transform var(--motion-slow) var(--ease-out)' }}>
      {FACES.map((f, i) => (
        <span key={i} style={{
          position: 'absolute', left: '50%', top: '50%', width: size, height: i > 3 ? depth : size,
          marginLeft: -size / 2, marginTop: (i > 3 ? -depth : -size) / 2,
          '--d': `${(i > 3 ? size : depth) / 2}px`, transform: f.t,
          background: highlight ? 'rgba(255,107,0,.16)' : muted ? 'rgba(20,22,26,.55)' : 'rgba(30,34,40,.72)',
          border: `1px solid ${highlight ? 'var(--orange-500)' : muted ? 'var(--border-subtle)' : 'var(--titanium-2)'}`,
          boxShadow: highlight ? 'inset 0 0 32px rgba(255,107,0,.28)' : 'inset 0 0 40px rgba(0,0,0,.5)',
          transition: 'var(--transition-control)',
        }} />
      ))}
      {label && <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(60px,-50%)',
        font: 'var(--type-technical-sm)', color: highlight ? 'var(--text-accent)' : 'var(--text-muted)',
        textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>}
    </div>
  );
}

/** Reusable 3D part viewer. CSS-3D stand-in geometry with the production toolbar,
 *  exploded-view and component-inspection states wired up. */
export function Viewer3D({ height = 480, exploded = false, autoRotate = true, selected = null,
  onSelect, components = ['Housing', 'Gear', 'Base'], toolbar = true, partId = 'PART_00492', style }) {
  const [rot, setRot] = React.useState({ x: -22, y: 32 });
  const [drag, setDrag] = React.useState(null);
  const [spin, setSpin] = React.useState(autoRotate);
  const [exp, setExp] = React.useState(exploded);
  React.useEffect(() => setExp(exploded), [exploded]);
  React.useEffect(() => {
    if (!spin || drag) return;
    const id = setInterval(() => setRot((r) => ({ ...r, y: r.y + 0.25 })), 32);
    return () => clearInterval(id);
  }, [spin, drag]);

  const gap = exp ? 90 : 0;
  return (
    <div style={{ position: 'relative', height, background: 'var(--gradient-viewer)',
      border: '1px solid var(--border-default)', borderRadius: 'var(--radius-panel-technical)', overflow: 'hidden',
      cursor: drag ? 'grabbing' : 'grab', userSelect: 'none', ...style }}
      onPointerDown={(e) => { setDrag({ x: e.clientX, y: e.clientY, rx: rot.x, ry: rot.y }); setSpin(false); }}
      onPointerMove={(e) => {
        if (!drag) return;
        setRot({
          x: Math.max(-80, Math.min(80, drag.rx - (e.clientY - drag.y) * 0.4)),
          y: drag.ry + (e.clientX - drag.x) * 0.4,
        });
      }}
      onPointerUp={() => setDrag(null)}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--bg-grid)' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 1400 }}>
        <div style={{ position: 'relative', width: 160, height: 160, transformStyle: 'preserve-3d',
          transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}>
          {components.map((c, i) => (
            <span key={c} onClick={(e) => { e.stopPropagation(); onSelect && onSelect(selected === c ? null : c); }}
              style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', cursor: 'pointer' }}>
              <Slab size={i === 1 ? 96 : 130} depth={26} offset={(i - 1) * gap}
                highlight={selected === c} muted={selected && selected !== c} label={exp ? c : null} />
            </span>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', top: 14, left: 16, font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--ls-technical)' }}>
        {partId} · {exp ? 'EXPLODED' : 'ASSEMBLY'}
      </div>
      {toolbar && (
        <div style={{ position: 'absolute', right: 14, top: 14, display: 'flex', flexDirection: 'column', gap: 6,
          background: 'rgba(10,11,13,.72)', backdropFilter: 'var(--blur-overlay)', border: '1px solid var(--border-subtle)', padding: 4 }}>
          <IconButton icon="rotate-3d" label="Auto-rotate" size="sm" active={spin} onClick={() => setSpin(!spin)} />
          <IconButton icon="layers" label="Exploded view" size="sm" active={exp} onClick={() => setExp(!exp)} />
          <IconButton icon="ruler" label="Measure" size="sm" />
          <IconButton icon="sun" label="Lighting" size="sm" />
          <IconButton icon="maximize" label="Fullscreen" size="sm" />
          <IconButton icon="rotate-ccw" label="Reset view" size="sm" onClick={() => setRot({ x: -22, y: 32 })} />
        </div>
      )}
      <div style={{ position: 'absolute', left: 16, bottom: 14, display: 'flex', gap: 16, font: 'var(--type-technical-sm)', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>
        <span>DRAG · ROTATE</span><span>SCROLL · ZOOM</span>
      </div>
    </div>
  );
}
