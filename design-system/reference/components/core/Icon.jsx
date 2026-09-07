import React from 'react';

const BASE = 'https://unpkg.com/lucide-static@0.451.0/icons/';

/** Monochrome technical glyph. Renders a Lucide outline icon as a CSS mask so it
 *  inherits currentColor. `name` is a lucide icon id, e.g. "box", "ruler", "cpu". */
export function Icon({ name = 'box', size = 16, strokeWidth, color = 'currentColor', title, style, ...rest }) {
  const url = `url("${BASE}${name}.svg")`;
  return (
    <span role={title ? 'img' : 'presentation'} aria-label={title} aria-hidden={title ? undefined : true}
      style={{ display: 'inline-block', width: size, height: size, flex: '0 0 auto', background: color,
        WebkitMaskImage: url, maskImage: url, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center', maskPosition: 'center', WebkitMaskSize: 'contain', maskSize: 'contain',
        ...style }} {...rest} />
  );
}
