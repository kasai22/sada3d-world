/* @ds-bundle: {"format":4,"namespace":"SADA3DDesignSystem_217828","components":[{"name":"MaterialCard","sourcePath":"components/commerce/MaterialCard.jsx"},{"name":"OrderSummary","sourcePath":"components/commerce/OrderSummary.jsx"},{"name":"PriceSummary","sourcePath":"components/commerce/PriceSummary.jsx"},{"name":"ProductCard","sourcePath":"components/commerce/ProductCard.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"StatusDot","sourcePath":"components/core/StatusDot.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"QuantityStepper","sourcePath":"components/forms/QuantityStepper.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"RangeSlider","sourcePath":"components/forms/RangeSlider.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"ManufacturingTimeline","sourcePath":"components/manufacturing/ManufacturingTimeline.jsx"},{"name":"ProgressBar","sourcePath":"components/manufacturing/ProgressBar.jsx"},{"name":"FilterTree","sourcePath":"components/navigation/FilterTree.jsx"},{"name":"Header","sourcePath":"components/navigation/Header.jsx"},{"name":"Breadcrumbs","sourcePath":"components/structure/Breadcrumbs.jsx"},{"name":"Panel","sourcePath":"components/structure/Panel.jsx"},{"name":"SectionHeading","sourcePath":"components/structure/SectionHeading.jsx"},{"name":"SpecTable","sourcePath":"components/structure/SpecTable.jsx"},{"name":"Stepper","sourcePath":"components/structure/Stepper.jsx"},{"name":"Viewer3D","sourcePath":"components/viewer/Viewer3D.jsx"}],"sourceHashes":{"components/commerce/MaterialCard.jsx":"f6ac400da01f","components/commerce/OrderSummary.jsx":"f6c389b58bda","components/commerce/PriceSummary.jsx":"6b4cdb2c7a82","components/commerce/ProductCard.jsx":"5d85dc4d300b","components/core/Button.jsx":"2bca04848d24","components/core/Icon.jsx":"dba4e1bd93ae","components/core/IconButton.jsx":"899a5047f3b7","components/core/StatusDot.jsx":"30310ec21269","components/core/Tag.jsx":"9878fc854c8f","components/forms/Checkbox.jsx":"4209346da2aa","components/forms/Input.jsx":"ca09b2655e0f","components/forms/QuantityStepper.jsx":"9bd4371cd01f","components/forms/Radio.jsx":"19bcbacd521c","components/forms/RangeSlider.jsx":"4fd193e78119","components/forms/Select.jsx":"3de451340921","components/forms/Switch.jsx":"bb8cdd1b06d1","components/manufacturing/ManufacturingTimeline.jsx":"83d6d4402ed6","components/manufacturing/ProgressBar.jsx":"432b6378442a","components/navigation/FilterTree.jsx":"5685f45bdb3d","components/navigation/Header.jsx":"b17e036da92c","components/structure/Breadcrumbs.jsx":"f1f82e8924a2","components/structure/Panel.jsx":"10c5f03e579f","components/structure/SectionHeading.jsx":"d124cc6f5220","components/structure/SpecTable.jsx":"327894e787fa","components/structure/Stepper.jsx":"bb0427545e38","components/viewer/Viewer3D.jsx":"6a9ee40a8f9d","ui_kits/platform/CheckoutScreen.jsx":"30b5d8a928ff","ui_kits/platform/ConfiguratorScreen.jsx":"77a4c80e7ee6","ui_kits/platform/HomeScreen.jsx":"95a027e43d1e","ui_kits/platform/MarketplaceScreen.jsx":"c14df01ed1fa","ui_kits/platform/ProductScreen.jsx":"b6ca95570f9c","ui_kits/platform/Shell.jsx":"8c691fc32a1b","ui_kits/platform/TrackingScreen.jsx":"ae3162276ad7","ui_kits/platform/data.js":"00f3465baa28"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.SADA3DDesignSystem_217828 = window.SADA3DDesignSystem_217828 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/commerce/MaterialCard.jsx
try { (() => {
const BARS = ['strength', 'flexibility', 'heat'];

/** Interactive material selector card — PLA / PETG / ABS / TPU / RESIN. */
function MaterialCard({
  name,
  code,
  description,
  properties = {},
  colors = [],
  multiplier,
  selected,
  onSelect,
  style
}) {
  const [hover, setHover] = React.useState(false);
  const on = selected;
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onSelect,
    "aria-pressed": !!selected,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      textAlign: 'left',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      padding: 20,
      background: on ? 'var(--interactive-selected-surface)' : 'var(--surface-card)',
      border: `1px solid ${on ? 'var(--border-accent)' : hover ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius-card)',
      cursor: 'pointer',
      transition: 'var(--transition-control)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-semibold)',
      fontSize: 22,
      letterSpacing: '0.06em',
      color: on ? 'var(--text-accent)' : 'var(--text-primary)'
    }
  }, name), multiplier && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)'
    }
  }, "\xD7", multiplier)), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      height: 2,
      width: on ? '100%' : 32,
      background: on ? 'var(--gradient-orange-line)' : 'var(--titanium)',
      transition: 'var(--transition-line)'
    }
  }), code && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-disabled)',
      textTransform: 'uppercase'
    }
  }, code), description && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-body-sm)',
      color: 'var(--text-secondary)'
    }
  }, description), /*#__PURE__*/React.createElement("dl", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      margin: 0
    }
  }, BARS.filter(b => properties[b] != null).map(b => /*#__PURE__*/React.createElement("div", {
    key: b,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("dt", {
    style: {
      width: 76,
      font: 'var(--type-technical-sm)',
      color: 'var(--text-disabled)',
      textTransform: 'uppercase'
    }
  }, b), /*#__PURE__*/React.createElement("dd", {
    style: {
      margin: 0,
      flex: 1,
      display: 'flex',
      gap: 3
    }
  }, Array.from({
    length: 5
  }).map((_, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      flex: 1,
      height: 3,
      background: i < properties[b] ? on ? 'var(--orange-500)' : 'var(--silver)' : 'var(--titanium)'
    }
  })))))), colors.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, colors.map(c => /*#__PURE__*/React.createElement("span", {
    key: c,
    title: c,
    style: {
      width: 16,
      height: 16,
      background: c,
      border: '1px solid var(--border-strong)'
    }
  }))));
}
Object.assign(__ds_scope, { MaterialCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/commerce/MaterialCard.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const BASE = 'https://unpkg.com/lucide-static@0.451.0/icons/';

/** Monochrome technical glyph. Renders a Lucide outline icon as a CSS mask so it
 *  inherits currentColor. `name` is a lucide icon id, e.g. "box", "ruler", "cpu". */
function Icon({
  name = 'box',
  size = 16,
  strokeWidth,
  color = 'currentColor',
  title,
  style,
  ...rest
}) {
  const url = `url("${BASE}${name}.svg")`;
  return /*#__PURE__*/React.createElement("span", _extends({
    role: title ? 'img' : 'presentation',
    "aria-label": title,
    "aria-hidden": title ? undefined : true,
    style: {
      display: 'inline-block',
      width: size,
      height: size,
      flex: '0 0 auto',
      background: color,
      WebkitMaskImage: url,
      maskImage: url,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    height: 'var(--control-height-sm)',
    padding: '0 14px',
    font: '11px',
    ls: '0.12em',
    icon: 14
  },
  md: {
    height: 'var(--control-height-md)',
    padding: '0 20px',
    font: '12px',
    ls: '0.12em',
    icon: 16
  },
  lg: {
    height: 'var(--control-height-lg)',
    padding: '0 28px',
    font: '13px',
    ls: '0.14em',
    icon: 18
  }
};
function skin(variant, state) {
  const map = {
    primary: {
      background: 'var(--gradient-orange)',
      color: 'var(--text-on-accent)',
      border: '1px solid var(--orange-600)'
    },
    secondary: {
      background: 'transparent',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-strong)'
    },
    tertiary: {
      background: 'var(--surface-raised)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-subtle)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      border: '1px solid transparent'
    },
    technical: {
      background: 'transparent',
      color: 'var(--text-accent)',
      border: '1px solid var(--border-accent)'
    },
    destructive: {
      background: 'transparent',
      color: 'var(--status-danger)',
      border: '1px solid rgba(255,77,77,.45)'
    }
  };
  const hover = {
    primary: {
      filter: 'brightness(1.08)',
      boxShadow: 'var(--glow-orange-sm)'
    },
    secondary: {
      borderColor: 'var(--white)',
      background: 'var(--interactive-hover-surface)'
    },
    tertiary: {
      background: 'var(--carbon-2)',
      borderColor: 'var(--border-default)'
    },
    ghost: {
      color: 'var(--text-primary)',
      background: 'var(--interactive-hover-surface)'
    },
    technical: {
      background: 'var(--surface-accent-soft)'
    },
    destructive: {
      background: 'var(--status-danger-surface)'
    }
  };
  return {
    ...map[variant],
    ...(state === 'hover' ? hover[variant] : null)
  };
}

/** SADA 3D action. Sharp corners, uppercase technical label, no pills. */
function Button({
  variant = 'primary',
  size = 'md',
  children,
  iconLeft,
  iconRight,
  loading,
  success,
  disabled,
  fullWidth,
  selected,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const inert = disabled || loading;
  const base = skin(variant, hover && !inert ? 'hover' : 'default');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: inert,
    "data-selected": selected || undefined,
    onMouseEnter: e => {
      setHover(true);
      onMouseEnter && onMouseEnter(e);
    },
    onMouseLeave: e => {
      setHover(false);
      onMouseLeave && onMouseLeave(e);
    },
    style: {
      display: fullWidth ? 'flex' : 'inline-flex',
      width: fullWidth ? '100%' : undefined,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: s.height,
      padding: s.padding,
      borderRadius: 'var(--radius-button)',
      fontFamily: 'var(--font-interface)',
      fontSize: s.font,
      fontWeight: 'var(--fw-semibold)',
      letterSpacing: s.ls,
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      cursor: inert ? 'not-allowed' : 'pointer',
      transition: 'var(--transition-control), filter var(--motion-fast) var(--ease-standard)',
      transform: 'translateZ(0)',
      ...base,
      ...(success ? {
        borderColor: 'var(--status-success)',
        color: 'var(--status-success)',
        background: 'var(--status-success-surface)',
        filter: 'none',
        boxShadow: 'none'
      } : null),
      ...(inert ? {
        background: 'var(--interactive-disabled-surface)',
        color: 'var(--text-disabled)',
        border: '1px solid var(--interactive-disabled-border)',
        filter: 'none',
        boxShadow: 'none'
      } : null),
      ...style
    }
  }, rest), loading && /*#__PURE__*/React.createElement("span", {
    style: {
      width: s.icon,
      height: s.icon,
      border: '2px solid currentColor',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'sada-spin 700ms linear infinite'
    }
  }), !loading && success && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: s.icon
  }), !loading && !success && iconLeft && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconLeft,
    size: s.icon
  }), /*#__PURE__*/React.createElement("span", null, children), !loading && iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: s.icon
  }), /*#__PURE__*/React.createElement("style", null, '@keyframes sada-spin{to{transform:rotate(360deg)}}'));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/commerce/OrderSummary.jsx
try { (() => {
/** Cart / checkout totals block. */
function OrderSummary({
  items = [],
  totals = [],
  total,
  cta = 'Complete Order',
  onCta,
  empty,
  style
}) {
  if (empty || items.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 40,
        textAlign: 'center',
        border: '1px solid var(--border-subtle)',
        background: 'var(--surface-card)',
        ...style
      }
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        margin: 0,
        font: 'var(--type-technical-sm)',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--ls-label)'
      }
    }, "Your order is empty"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
      variant: "secondary",
      size: "sm",
      style: {
        marginTop: 20
      }
    }, "Explore designs"));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 16,
      padding: '16px 0',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-medium)',
      fontSize: 14,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      color: 'var(--text-primary)'
    }
  }, it.name), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase'
    }
  }, it.spec), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-disabled)'
    }
  }, "\xD7 ", it.qty)), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical)',
      color: 'var(--text-primary)'
    }
  }, it.price)))), /*#__PURE__*/React.createElement("dl", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      margin: 0
    }
  }, totals.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.label,
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("dt", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-label)'
    }
  }, t.label), /*#__PURE__*/React.createElement("dd", {
    style: {
      margin: 0,
      font: 'var(--type-technical)',
      color: 'var(--text-secondary)'
    }
  }, t.value)))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '2px solid var(--border-accent)',
      paddingTop: 16,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-primary)'
    }
  }, "Total"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-technical)',
      fontWeight: 'var(--fw-medium)',
      fontSize: 26,
      color: 'var(--text-primary)'
    }
  }, total)), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "primary",
    size: "lg",
    fullWidth: true,
    onClick: onCta
  }, cta));
}
Object.assign(__ds_scope, { OrderSummary });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/commerce/OrderSummary.jsx", error: String((e && e.message) || e) }); }

// components/commerce/PriceSummary.jsx
try { (() => {
/** Live manufacturing price panel — part analysis + estimated price with all calc states. */
function PriceSummary({
  analysis = [],
  price,
  state = 'valid',
  message,
  cta = 'Configure Print',
  onCta,
  note,
  style
}) {
  const invalid = state === 'invalid' || state === 'error';
  const busy = state === 'calculating' || state === 'updating';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface-card)',
      border: `1px solid ${invalid ? 'var(--status-danger)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-panel-technical)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 20px',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-primary)'
    }
  }, "Part analysis")), /*#__PURE__*/React.createElement("dl", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      margin: 0,
      padding: 20
    }
  }, analysis.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.label,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("dt", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase'
    }
  }, a.label), /*#__PURE__*/React.createElement("dd", {
    style: {
      margin: 0,
      font: 'var(--type-technical)',
      color: 'var(--text-primary)',
      opacity: busy ? .4 : 1,
      transition: 'opacity var(--motion-fast) var(--ease-standard)'
    }
  }, a.value)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20,
      borderTop: '1px solid var(--border-subtle)',
      background: 'var(--surface-panel)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-label)'
    }
  }, "Estimated price"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-technical)',
      fontWeight: 'var(--fw-medium)',
      fontSize: 40,
      lineHeight: 1,
      color: invalid ? 'var(--text-disabled)' : 'var(--text-primary)'
    }
  }, busy ? '—' : invalid ? '—' : price), busy && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-accent)',
      textTransform: 'uppercase'
    }
  }, state === 'calculating' ? 'Calculating' : 'Updating')), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'block',
      height: 2,
      marginTop: 14,
      background: invalid ? 'var(--status-danger)' : 'var(--gradient-orange-line)',
      boxShadow: invalid ? 'none' : 'var(--glow-line)'
    }
  }), message && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '14px 0 0',
      font: 'var(--type-body-sm)',
      color: invalid ? 'var(--status-danger)' : 'var(--text-muted)'
    }
  }, message), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: invalid ? 'secondary' : 'primary',
    fullWidth: true,
    disabled: invalid,
    loading: busy,
    onClick: onCta,
    style: {
      marginTop: 16
    }
  }, cta), note && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '12px 0 0',
      font: 'var(--type-technical-sm)',
      color: 'var(--text-disabled)',
      textTransform: 'uppercase'
    }
  }, note)));
}
Object.assign(__ds_scope, { PriceSummary });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/commerce/PriceSummary.jsx", error: String((e && e.message) || e) }); }

// components/commerce/ProductCard.jsx
try { (() => {
/** Minimal premium product card. Sharp corners, generous whitespace, technical metadata. */
function ProductCard({
  name,
  material = 'PLA',
  color = 'Black',
  price,
  meta = [],
  badge,
  variant = 'default',
  href = '#',
  onView,
  style
}) {
  const [hover, setHover] = React.useState(false);
  const compact = variant === 'compact';
  const featured = variant === 'featured';
  return /*#__PURE__*/React.createElement("article", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface-card)',
      border: `1px solid ${hover ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius-card)',
      transform: hover ? 'translateY(var(--hover-lift))' : 'none',
      transition: 'var(--transition-surface), border-color var(--motion-fast) var(--ease-standard)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: featured ? '16 / 10' : '4 / 3',
      background: 'var(--gradient-viewer)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'var(--bg-grid)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: featured ? 132 : 96,
      height: featured ? 132 : 96,
      transform: `translate(-50%,-50%) rotateX(-20deg) rotateY(${hover ? 42 : 28}deg)`,
      transformStyle: 'preserve-3d',
      background: 'var(--gradient-metal)',
      border: '1px solid var(--titanium-2)',
      boxShadow: hover ? 'var(--glow-orange-sm), inset 0 0 40px rgba(0,0,0,.6)' : 'inset 0 0 40px rgba(0,0,0,.6)',
      transition: 'transform var(--motion-slow) var(--ease-out), box-shadow var(--motion-medium) var(--ease-standard)'
    }
  }), badge && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 12,
      left: 12,
      padding: '3px 8px',
      background: 'var(--surface-accent-soft)',
      border: '1px solid var(--border-accent)',
      color: 'var(--text-accent)',
      font: 'var(--type-technical-sm)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-technical)'
    }
  }, badge), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 2,
      background: 'var(--gradient-orange-line)',
      transform: hover ? 'scaleX(1)' : 'scaleX(0)',
      transformOrigin: 'left',
      transition: 'var(--transition-line)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: compact ? 8 : 12,
      padding: compact ? 16 : 20,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-medium)',
      fontSize: compact ? 15 : 17,
      letterSpacing: '0.02em',
      textTransform: 'uppercase',
      color: 'var(--text-primary)'
    }
  }, name), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-technical)'
    }
  }, material, " / ", color), !compact && meta.length > 0 && /*#__PURE__*/React.createElement("dl", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      gap: '4px 12px',
      margin: 0
    }
  }, meta.map(m => /*#__PURE__*/React.createElement(React.Fragment, {
    key: m.label
  }, /*#__PURE__*/React.createElement("dt", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-disabled)',
      textTransform: 'uppercase'
    }
  }, m.label), /*#__PURE__*/React.createElement("dd", {
    style: {
      margin: 0,
      textAlign: 'right',
      font: 'var(--type-technical-sm)',
      color: 'var(--text-secondary)'
    }
  }, m.value)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      paddingTop: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderTop: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--fw-medium) 17px/1 var(--font-technical)',
      color: 'var(--text-primary)'
    }
  }, price), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "secondary",
    size: "sm",
    onClick: onView
  }, "View"))));
}
Object.assign(__ds_scope, { ProductCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/commerce/ProductCard.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SZ = {
  sm: 32,
  md: 40,
  lg: 48
};

/** Square icon-only control. Used in the 3D viewer toolbar, header utilities, table row actions. */
function IconButton({
  icon = 'box',
  size = 'md',
  label,
  active,
  variant = 'ghost',
  disabled,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const d = SZ[size] || SZ.md;
  const outlined = variant === 'outline';
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    "aria-pressed": active,
    disabled: disabled,
    title: label,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: d,
      height: d,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-button)',
      border: outlined ? '1px solid var(--border-default)' : '1px solid transparent',
      background: active ? 'var(--interactive-selected-surface)' : hover && !disabled ? 'var(--interactive-hover-surface)' : 'transparent',
      borderColor: active ? 'var(--border-accent)' : outlined ? 'var(--border-default)' : 'transparent',
      color: disabled ? 'var(--text-disabled)' : active ? 'var(--text-accent)' : hover ? 'var(--text-primary)' : 'var(--text-secondary)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'var(--transition-control)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === 'sm' ? 15 : size === 'lg' ? 20 : 17
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusDot.jsx
try { (() => {
const COLORS = {
  queued: 'var(--status-idle)',
  processing: 'var(--status-info)',
  printing: 'var(--status-active)',
  quality: 'var(--status-info)',
  packaging: 'var(--status-info)',
  shipped: 'var(--status-success)',
  delivered: 'var(--status-success)',
  paused: 'var(--status-warning)',
  failed: 'var(--status-danger)',
  complete: 'var(--status-success)',
  idle: 'var(--status-idle)'
};

/** Manufacturing status indicator. Never relies on colour alone — always pair with a text label. */
function StatusDot({
  status = 'idle',
  pulse = false,
  size = 8,
  label,
  style
}) {
  const c = COLORS[status] || COLORS.idle;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: size,
      height: size,
      borderRadius: 'var(--radius-pill)',
      background: c,
      boxShadow: pulse ? `0 0 0 3px color-mix(in srgb, ${c} 22%, transparent)` : 'none',
      animation: pulse ? 'sada-pulse 1.6s var(--ease-standard) infinite' : 'none'
    }
  }), label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-secondary)'
    }
  }, label), /*#__PURE__*/React.createElement("style", null, '@keyframes sada-pulse{0%,100%{opacity:1}50%{opacity:.45}}'));
}
Object.assign(__ds_scope, { StatusDot });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusDot.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONE = {
  neutral: {
    color: 'var(--text-secondary)',
    border: 'var(--border-default)',
    bg: 'transparent'
  },
  accent: {
    color: 'var(--text-accent)',
    border: 'var(--border-accent)',
    bg: 'var(--surface-accent-soft)'
  },
  success: {
    color: 'var(--status-success)',
    border: 'rgba(62,213,152,.4)',
    bg: 'var(--status-success-surface)'
  },
  warning: {
    color: 'var(--status-warning)',
    border: 'rgba(255,195,77,.4)',
    bg: 'var(--status-warning-surface)'
  },
  danger: {
    color: 'var(--status-danger)',
    border: 'rgba(255,77,77,.4)',
    bg: 'var(--status-danger-surface)'
  },
  info: {
    color: 'var(--status-info)',
    border: 'rgba(77,163,255,.4)',
    bg: 'var(--status-info-surface)'
  }
};

/** Technical label chip. Also the filter chip when `onRemove` is supplied. */
function Tag({
  children,
  tone = 'neutral',
  mono = true,
  onRemove,
  icon,
  style,
  ...rest
}) {
  const t = TONE[tone] || TONE.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 24,
      padding: '0 8px',
      borderRadius: 'var(--radius-chip)',
      border: `1px solid ${t.border}`,
      background: t.bg,
      color: t.color,
      fontFamily: mono ? 'var(--font-technical)' : 'var(--font-interface)',
      fontSize: 11,
      letterSpacing: 'var(--ls-technical)',
      textTransform: 'uppercase',
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 12
  }), children, onRemove && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onRemove,
    "aria-label": "Remove filter",
    style: {
      background: 'none',
      border: 0,
      padding: 0,
      marginLeft: 2,
      display: 'flex',
      color: 'inherit',
      cursor: 'pointer',
      opacity: .7
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 12
  })));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Square 16px checkbox — the filter-tree primitive. */
function Checkbox({
  label,
  count,
  checked,
  indeterminate,
  disabled,
  onChange,
  style,
  ...rest
}) {
  const on = checked || indeterminate;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      minHeight: 32,
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
      font: 'var(--type-body-sm)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    checked: !!checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 16,
      height: 16,
      flex: '0 0 auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-xs)',
      border: `1px solid ${on ? 'var(--orange-500)' : 'var(--border-strong)'}`,
      background: on ? 'var(--orange-500)' : 'transparent',
      transition: 'var(--transition-control)'
    }
  }, checked && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 12,
    color: "var(--text-on-accent)"
  }), !checked && indeterminate && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 2,
      background: 'var(--text-on-accent)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      color: checked ? 'var(--text-primary)' : undefined
    }
  }, label), count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)'
    }
  }, count));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Text / numeric field. 3px corners, hairline titanium border, orange focus rule. */
function Input({
  label,
  hint,
  error,
  icon,
  suffix,
  size = 'md',
  disabled,
  technical,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const h = size === 'sm' ? 'var(--control-height-sm)' : size === 'lg' ? 'var(--control-height-lg)' : 'var(--control-height-md)';
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: h,
      padding: '0 12px',
      background: disabled ? 'var(--interactive-disabled-surface)' : 'var(--surface-panel)',
      border: `1px solid ${error ? 'var(--status-danger)' : focus ? 'var(--border-focus)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-input)',
      transition: 'var(--transition-control)',
      boxShadow: focus && !error ? 'var(--glow-orange-xs)' : 'none'
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 15,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("input", _extends({
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      background: 'none',
      border: 0,
      outline: 'none',
      color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
      font: technical ? 'var(--type-technical)' : 'var(--type-body)',
      letterSpacing: technical ? 'var(--ls-technical)' : 'var(--ls-body)'
    }
  }, rest)), suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase'
    }
  }, suffix)), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-sm)',
      color: error ? 'var(--status-danger)' : 'var(--text-muted)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/QuantityStepper.jsx
try { (() => {
/** Quantity control for product and configurator pages. */
function QuantityStepper({
  value = 1,
  min = 1,
  max = 999,
  onChange,
  style
}) {
  const set = v => onChange && onChange(Math.min(max, Math.max(min, v)));
  const btn = {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 0,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'var(--transition-control)'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-input)',
      background: 'var(--surface-panel)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Decrease quantity",
    onClick: () => set(value - 1),
    style: btn
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "minus",
    size: 14
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 40,
      textAlign: 'center',
      font: 'var(--type-technical)',
      color: 'var(--text-primary)'
    }
  }, String(value).padStart(2, '0')), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Increase quantity",
    onClick: () => set(value + 1),
    style: btn
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "plus",
    size: 14
  })));
}
Object.assign(__ds_scope, { QuantityStepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/QuantityStepper.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Single-choice control. Circular by exception — the only round control in SADA 3D. */
function Radio({
  label,
  description,
  checked,
  disabled,
  name,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      minHeight: 32,
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
      font: 'var(--type-body-sm)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "radio",
    name: name,
    checked: !!checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 16,
      height: 16,
      marginTop: 2,
      flex: '0 0 auto',
      borderRadius: 'var(--radius-pill)',
      border: `1px solid ${checked ? 'var(--orange-500)' : 'var(--border-strong)'}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'var(--transition-control)'
    }
  }, checked && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--orange-500)'
    }
  })), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: checked ? 'var(--text-primary)' : undefined
    }
  }, label), description && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, description)));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/RangeSlider.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Single-value range control — price filters, infill percentage. */
function RangeSlider({
  min = 0,
  max = 100,
  value = 50,
  step = 1,
  onChange,
  label,
  format,
  style,
  ...rest
}) {
  const pct = (value - min) / (max - min) * 100;
  const fmt = format || (v => v);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical)',
      color: 'var(--text-accent)'
    }
  }, fmt(value))), /*#__PURE__*/React.createElement("input", _extends({
    type: "range",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: onChange,
    style: {
      appearance: 'none',
      width: '100%',
      height: 2,
      background: `linear-gradient(90deg,var(--orange-500) ${pct}%,var(--titanium) ${pct}%)`,
      outline: 'none',
      cursor: 'pointer'
    }
  }, rest)), /*#__PURE__*/React.createElement("style", null, 'input[type=range]::-webkit-slider-thumb{appearance:none;width:4px;height:16px;background:var(--white);border-radius:1px;cursor:pointer;box-shadow:0 0 8px rgba(255,107,0,.5)}input[type=range]::-moz-range-thumb{width:4px;height:16px;background:var(--white);border:0;border-radius:1px}'));
}
Object.assign(__ds_scope, { RangeSlider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/RangeSlider.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Native select styled to the SADA 3D field spec. */
function Select({
  label,
  options = [],
  hint,
  error,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    disabled: disabled,
    style: {
      appearance: 'none',
      width: '100%',
      height: 'var(--control-height-md)',
      padding: '0 36px 0 12px',
      background: disabled ? 'var(--interactive-disabled-surface)' : 'var(--surface-panel)',
      border: `1px solid ${error ? 'var(--status-danger)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-input)',
      color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
      font: 'var(--type-body)',
      cursor: disabled ? 'not-allowed' : 'pointer'
    }
  }, rest), options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v,
      style: {
        background: 'var(--carbon)'
      }
    }, l);
  })), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 15,
    color: "var(--text-muted)",
    style: {
      position: 'absolute',
      right: 12,
      pointerEvents: 'none'
    }
  })), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-sm)',
      color: error ? 'var(--status-danger)' : 'var(--text-muted)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Binary toggle for viewer / configurator options. Rectangular track, sharp knob. */
function Switch({
  checked,
  onChange,
  label,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      cursor: disabled ? 'not-allowed' : 'pointer',
      font: 'var(--type-body-sm)',
      color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    checked: !!checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 38,
      height: 20,
      padding: 2,
      borderRadius: 'var(--radius-xs)',
      background: checked ? 'var(--orange-500)' : 'var(--carbon-2)',
      border: `1px solid ${checked ? 'var(--orange-600)' : 'var(--border-default)'}`,
      display: 'flex',
      justifyContent: checked ? 'flex-end' : 'flex-start',
      transition: 'var(--transition-control)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 14,
      background: checked ? 'var(--void)' : 'var(--steel)',
      borderRadius: '1px',
      transition: 'var(--transition-control)'
    }
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/manufacturing/ProgressBar.jsx
try { (() => {
/** Manufacturing progress. Segmented orange fill against a titanium track. */
function ProgressBar({
  value = 0,
  label,
  showValue = true,
  segments = 20,
  tone = 'active',
  style
}) {
  const filled = Math.round(value / 100 * segments);
  const color = tone === 'paused' ? 'var(--status-warning)' : tone === 'failed' ? 'var(--status-danger)' : tone === 'complete' ? 'var(--status-success)' : 'var(--orange-500)';
  return /*#__PURE__*/React.createElement("div", {
    role: "progressbar",
    "aria-valuenow": value,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-label": label,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      ...style
    }
  }, (label || showValue) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      font: 'var(--type-technical-sm)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-label)'
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)'
    }
  }, label), showValue && /*#__PURE__*/React.createElement("span", {
    style: {
      color
    }
  }, value, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2
    }
  }, Array.from({
    length: segments
  }).map((_, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      flex: 1,
      height: 6,
      background: i < filled ? color : 'var(--titanium)',
      boxShadow: i === filled - 1 ? 'var(--glow-line)' : 'none',
      transition: 'background var(--motion-medium) var(--ease-standard)'
    }
  }))));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/manufacturing/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/manufacturing/ManufacturingTimeline.jsx
try { (() => {
/** Seven-stage manufacturing tracker — replaces the generic shipment timeline. */
function ManufacturingTimeline({
  stages = [],
  style
}) {
  return /*#__PURE__*/React.createElement("ol", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column'
    }
  }, stages.map((s, i) => {
    const done = s.state === 'complete';
    const active = s.state === 'active';
    const failed = s.state === 'failed';
    const color = failed ? 'var(--status-danger)' : done ? 'var(--status-success)' : active ? 'var(--orange-500)' : 'var(--text-disabled)';
    return /*#__PURE__*/React.createElement("li", {
      key: s.label,
      style: {
        display: 'flex',
        gap: 16,
        ...style
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 20
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${done || active || failed ? color : 'var(--border-default)'}`,
        background: active ? 'var(--surface-accent-soft)' : 'transparent'
      }
    }, done && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "check",
      size: 12,
      color: color
    }), active && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        background: color,
        animation: 'sada-pulse 1.6s var(--ease-standard) infinite'
      }
    }), failed && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "x",
      size: 12,
      color: color
    })), i < stages.length - 1 && /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        width: 1,
        minHeight: 28,
        background: done ? 'var(--status-success)' : 'var(--border-subtle)'
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        paddingBottom: 24
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'baseline'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 10,
        alignItems: 'baseline'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-technical-sm)',
        color: 'var(--text-disabled)'
      }
    }, String(i + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-label)',
        letterSpacing: 'var(--ls-label)',
        textTransform: 'uppercase',
        color: done || active ? 'var(--text-primary)' : 'var(--text-muted)'
      }
    }, s.label)), s.meta && /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-technical-sm)',
        color: 'var(--text-muted)',
        textTransform: 'uppercase'
      }
    }, s.meta)), active && s.progress != null && /*#__PURE__*/React.createElement(__ds_scope.ProgressBar, {
      value: s.progress,
      showValue: true,
      label: null,
      style: {
        marginTop: 12,
        maxWidth: 320
      }
    })), /*#__PURE__*/React.createElement("style", null, '@keyframes sada-pulse{0%,100%{opacity:1}50%{opacity:.4}}'));
  }));
}
Object.assign(__ds_scope, { ManufacturingTimeline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/manufacturing/ManufacturingTimeline.jsx", error: String((e && e.message) || e) }); }

// components/navigation/FilterTree.jsx
try { (() => {
/** Nested facet navigation (up to 3 levels). Amazon-grade information architecture,
 *  SADA 3D surface treatment. */
function FilterTree({
  groups = [],
  selected = [],
  onToggle,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      ...style
    }
  }, groups.map(g => /*#__PURE__*/React.createElement(Group, {
    key: g.label,
    group: g,
    selected: selected,
    onToggle: onToggle
  })));
}
function Group({
  group,
  selected,
  onToggle
}) {
  const [open, setOpen] = React.useState(group.defaultOpen !== false);
  return /*#__PURE__*/React.createElement("section", {
    style: {
      borderBottom: '1px solid var(--border-subtle)',
      paddingBottom: open ? 12 : 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setOpen(!open),
    "aria-expanded": open,
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: '14px 0',
      background: 'none',
      border: 0,
      cursor: 'pointer',
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-primary)'
    }
  }, group.label, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: open ? 'minus' : 'plus',
    size: 13,
    color: "var(--text-muted)"
  })), open && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, (group.options || []).map(o => /*#__PURE__*/React.createElement(Node, {
    key: o.label,
    node: o,
    level: 1,
    selected: selected,
    onToggle: onToggle
  }))));
}
function Node({
  node,
  level,
  selected,
  onToggle
}) {
  const [open, setOpen] = React.useState(level === 1 && node.defaultOpen);
  const kids = node.children || [];
  const checked = selected.includes(node.label);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      paddingLeft: level > 1 ? 14 : 0,
      borderLeft: level > 1 ? '1px solid var(--border-subtle)' : 0,
      marginLeft: level > 1 ? 4 : 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, kids.length > 0 && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": open ? 'Collapse' : 'Expand',
    onClick: () => setOpen(!open),
    style: {
      width: 18,
      height: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'none',
      border: 0,
      color: 'var(--text-muted)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: open ? 'chevron-down' : 'chevron-right',
    size: 13
  })), /*#__PURE__*/React.createElement(__ds_scope.Checkbox, {
    label: node.label,
    count: node.count,
    checked: checked,
    onChange: () => onToggle && onToggle(node.label),
    style: {
      flex: 1,
      paddingLeft: kids.length ? 0 : 22
    }
  })), open && kids.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      paddingBottom: 4
    }
  }, kids.map(k => /*#__PURE__*/React.createElement(Node, {
    key: k.label,
    node: k,
    level: level + 1,
    selected: selected,
    onToggle: onToggle
  }))));
}
Object.assign(__ds_scope, { FilterTree });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/FilterTree.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Header.jsx
try { (() => {
const LINKS = ['Shop', 'Custom Print', 'Materials', 'Solutions', 'How It Works'];

/** Sticky platform header. Wordmark left, five links centred, utilities right. */
function Header({
  active = 'Shop',
  links = LINKS,
  cartCount = 0,
  onNavigate,
  sticky = true,
  style
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: sticky ? 'sticky' : 'static',
      top: 0,
      zIndex: 200,
      height: 'var(--header-height)',
      display: 'flex',
      alignItems: 'center',
      gap: 32,
      padding: '0 32px',
      background: 'rgba(5,5,6,.82)',
      backdropFilter: 'var(--blur-header)',
      WebkitBackdropFilter: 'var(--blur-header)',
      borderBottom: '1px solid var(--border-subtle)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate && onNavigate('Home');
    },
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 2,
      borderBottom: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-semibold)',
      fontSize: 17,
      letterSpacing: '0.16em',
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-primary)'
    }
  }, "SADA"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-accent)'
    }
  }, "3D")), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 4,
      marginLeft: 12,
      flex: 1
    }
  }, links.map(l => {
    const on = l === active;
    return /*#__PURE__*/React.createElement("a", {
      key: l,
      href: "#",
      onClick: e => {
        e.preventDefault();
        onNavigate && onNavigate(l);
      },
      style: {
        position: 'relative',
        padding: '0 14px',
        height: 'var(--header-height)',
        display: 'flex',
        alignItems: 'center',
        borderBottom: 0,
        font: 'var(--type-ui)',
        letterSpacing: 'var(--ls-interface)',
        color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
        transition: 'var(--transition-control)'
      }
    }, l, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 0,
        height: 2,
        background: 'var(--gradient-orange-line)',
        boxShadow: 'var(--glow-line)',
        transform: on ? 'scaleX(1)' : 'scaleX(0)',
        transformOrigin: 'left',
        transition: 'var(--transition-line)'
      }
    }));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, [['search', 'Search'], ['user', 'Account']].map(([ic, lb]) => /*#__PURE__*/React.createElement("button", {
    key: ic,
    type: "button",
    "aria-label": lb,
    onClick: () => onNavigate && onNavigate(lb),
    style: {
      width: 40,
      height: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'none',
      border: 0,
      color: 'var(--text-secondary)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: ic,
    size: 17
  }))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Cart",
    onClick: () => onNavigate && onNavigate('Cart'),
    style: {
      position: 'relative',
      width: 40,
      height: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'none',
      border: 0,
      color: 'var(--text-secondary)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "shopping-bag",
    size: 17
  }), cartCount > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 6,
      right: 4,
      minWidth: 15,
      height: 15,
      padding: '0 3px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--orange-500)',
      color: 'var(--text-on-accent)',
      font: 'var(--fw-bold) 9px/1 var(--font-technical)',
      borderRadius: 'var(--radius-xs)'
    }
  }, cartCount))));
}
Object.assign(__ds_scope, { Header });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Header.jsx", error: String((e && e.message) || e) }); }

// components/structure/Breadcrumbs.jsx
try { (() => {
/** Technical breadcrumb trail — mono, uppercase, slash separators. */
function Breadcrumbs({
  items = [],
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Breadcrumb",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      font: 'var(--type-technical-sm)',
      letterSpacing: 'var(--ls-technical)',
      textTransform: 'uppercase',
      ...style
    }
  }, items.map((it, i) => {
    const last = i === items.length - 1;
    const label = typeof it === 'string' ? it : it.label;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: i
    }, last ? /*#__PURE__*/React.createElement("span", {
      "aria-current": "page",
      style: {
        color: 'var(--text-primary)'
      }
    }, label) : /*#__PURE__*/React.createElement("a", {
      href: typeof it === 'object' && it.href || '#',
      style: {
        color: 'var(--text-muted)',
        borderBottom: 0
      }
    }, label), !last && /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        color: 'var(--titanium-2)'
      }
    }, "/"));
  }));
}
Object.assign(__ds_scope, { Breadcrumbs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/structure/Breadcrumbs.jsx", error: String((e && e.message) || e) }); }

// components/structure/Panel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Carbon surface container. `technical` drops the radius to 0 and adds the corner ticks. */
function Panel({
  children,
  title,
  meta,
  technical,
  padded = true,
  elevated,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("section", _extends({
    style: {
      position: 'relative',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: technical ? 'var(--radius-panel-technical)' : 'var(--radius-card)',
      boxShadow: elevated ? 'var(--elevation-2)' : 'none',
      ...style
    }
  }, rest), title && /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      padding: '14px 20px',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-primary)'
    }
  }, title), meta && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase'
    }
  }, meta)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: padded ? 'var(--space-inset-panel)' : 0
    }
  }, children), technical && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Tick, {
    pos: {
      top: -1,
      left: -1
    }
  }), /*#__PURE__*/React.createElement(Tick, {
    pos: {
      top: -1,
      right: -1
    }
  }), /*#__PURE__*/React.createElement(Tick, {
    pos: {
      bottom: -1,
      left: -1
    }
  }), /*#__PURE__*/React.createElement(Tick, {
    pos: {
      bottom: -1,
      right: -1
    }
  })));
}
function Tick({
  pos
}) {
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      width: 6,
      height: 6,
      borderTop: '1px solid var(--orange-500)',
      borderLeft: '1px solid var(--orange-500)',
      transform: `rotate(${pos.top != null ? pos.left != null ? 0 : 90 : pos.left != null ? 270 : 180}deg)`,
      ...pos
    }
  });
}
Object.assign(__ds_scope, { Panel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/structure/Panel.jsx", error: String((e && e.message) || e) }); }

// components/structure/SectionHeading.jsx
try { (() => {
/** THE TITANIUM ORANGE LINE — the SADA 3D signature. An uppercase label above a
 *  2px orange rule. Opens every section, panel and technical block. */
function SectionHeading({
  children,
  index,
  meta,
  width = 48,
  full = false,
  align = 'left',
  size = 'md',
  style
}) {
  const fs = size === 'lg' ? 'var(--fs-h3)' : size === 'sm' ? 11 : 13;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      alignItems: align === 'center' ? 'center' : 'stretch',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 16,
      justifyContent: align === 'center' ? 'center' : 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: 12
    }
  }, index && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-accent)',
      letterSpacing: 'var(--ls-technical)'
    }
  }, index), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-semibold)',
      fontSize: fs,
      letterSpacing: size === 'lg' ? 'var(--ls-heading)' : 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-primary)'
    }
  }, children)), meta && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase'
    }
  }, meta)), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      height: 2,
      width: full ? '100%' : width,
      background: 'var(--gradient-orange-line)',
      boxShadow: 'var(--glow-line)'
    }
  }));
}
Object.assign(__ds_scope, { SectionHeading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/structure/SectionHeading.jsx", error: String((e && e.message) || e) }); }

// components/structure/SpecTable.jsx
try { (() => {
/** Technical specifications table — label left, mono value right, hairline rows. */
function SpecTable({
  rows = [],
  dense,
  highlightKeys = [],
  style
}) {
  return /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      ...style
    }
  }, /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => {
    const hot = highlightKeys.includes(r.label);
    return /*#__PURE__*/React.createElement("tr", {
      key: i,
      style: {
        borderBottom: '1px solid var(--border-subtle)'
      }
    }, /*#__PURE__*/React.createElement("th", {
      scope: "row",
      style: {
        textAlign: 'left',
        padding: dense ? '8px 0' : '12px 0',
        font: 'var(--type-technical-sm)',
        letterSpacing: 'var(--ls-label)',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        fontWeight: 400
      }
    }, r.label), /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: 'right',
        padding: dense ? '8px 0' : '12px 0',
        font: 'var(--type-technical)',
        color: hot ? 'var(--text-accent)' : 'var(--text-primary)',
        letterSpacing: 'var(--ls-technical)'
      }
    }, r.value));
  })));
}
Object.assign(__ds_scope, { SpecTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/structure/SpecTable.jsx", error: String((e && e.message) || e) }); }

// components/structure/Stepper.jsx
try { (() => {
/** Horizontal process stepper — the configurator flow (01 UPLOAD → 05 REVIEW). */
function Stepper({
  steps = [],
  current = 0,
  onSelect,
  style
}) {
  return /*#__PURE__*/React.createElement("ol", {
    style: {
      display: 'flex',
      listStyle: 'none',
      margin: 0,
      padding: 0,
      gap: 0,
      width: '100%',
      ...style
    }
  }, steps.map((s, i) => {
    const done = i < current,
      active = i === current;
    const label = typeof s === 'string' ? s : s.label;
    return /*#__PURE__*/React.createElement("li", {
      key: i,
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => onSelect && onSelect(i),
      disabled: !onSelect,
      style: {
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: 0,
        padding: '0 16px 12px 0',
        cursor: onSelect ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-technical-sm)',
        color: active ? 'var(--text-accent)' : done ? 'var(--text-secondary)' : 'var(--text-disabled)'
      }
    }, String(i + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-label)',
        letterSpacing: 'var(--ls-label)',
        textTransform: 'uppercase',
        color: active ? 'var(--text-primary)' : done ? 'var(--text-secondary)' : 'var(--text-disabled)'
      }
    }, label), done && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "check",
      size: 12,
      color: "var(--status-success)"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        height: 2,
        width: '100%',
        background: active ? 'var(--gradient-orange-line)' : done ? 'var(--titanium-2)' : 'var(--border-subtle)',
        boxShadow: active ? 'var(--glow-line)' : 'none',
        transition: 'var(--transition-control)'
      }
    })));
  }));
}
Object.assign(__ds_scope, { Stepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/structure/Stepper.jsx", error: String((e && e.message) || e) }); }

// components/viewer/Viewer3D.jsx
try { (() => {
const FACES = [{
  t: 'translateZ(var(--d))'
}, {
  t: 'rotateY(180deg) translateZ(var(--d))'
}, {
  t: 'rotateY(90deg) translateZ(var(--d))'
}, {
  t: 'rotateY(-90deg) translateZ(var(--d))'
}, {
  t: 'rotateX(90deg) translateZ(var(--d))'
}, {
  t: 'rotateX(-90deg) translateZ(var(--d))'
}];
function Slab({
  size,
  depth,
  offset,
  highlight,
  muted,
  label
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      transformStyle: 'preserve-3d',
      transform: `translateY(${offset}px)`,
      transition: 'transform var(--motion-slow) var(--ease-out)'
    }
  }, FACES.map((f, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: size,
      height: i > 3 ? depth : size,
      marginLeft: -size / 2,
      marginTop: (i > 3 ? -depth : -size) / 2,
      '--d': `${(i > 3 ? size : depth) / 2}px`,
      transform: f.t,
      background: highlight ? 'rgba(255,107,0,.16)' : muted ? 'rgba(20,22,26,.55)' : 'rgba(30,34,40,.72)',
      border: `1px solid ${highlight ? 'var(--orange-500)' : muted ? 'var(--border-subtle)' : 'var(--titanium-2)'}`,
      boxShadow: highlight ? 'inset 0 0 32px rgba(255,107,0,.28)' : 'inset 0 0 40px rgba(0,0,0,.5)',
      transition: 'var(--transition-control)'
    }
  })), label && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(60px,-50%)',
      font: 'var(--type-technical-sm)',
      color: highlight ? 'var(--text-accent)' : 'var(--text-muted)',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap'
    }
  }, label));
}

/** Reusable 3D part viewer. CSS-3D stand-in geometry with the production toolbar,
 *  exploded-view and component-inspection states wired up. */
function Viewer3D({
  height = 480,
  exploded = false,
  autoRotate = true,
  selected = null,
  onSelect,
  components = ['Housing', 'Gear', 'Base'],
  toolbar = true,
  partId = 'PART_00492',
  style
}) {
  const [rot, setRot] = React.useState({
    x: -22,
    y: 32
  });
  const [drag, setDrag] = React.useState(null);
  const [spin, setSpin] = React.useState(autoRotate);
  const [exp, setExp] = React.useState(exploded);
  React.useEffect(() => setExp(exploded), [exploded]);
  React.useEffect(() => {
    if (!spin || drag) return;
    const id = setInterval(() => setRot(r => ({
      ...r,
      y: r.y + 0.25
    })), 32);
    return () => clearInterval(id);
  }, [spin, drag]);
  const gap = exp ? 90 : 0;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height,
      background: 'var(--gradient-viewer)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-panel-technical)',
      overflow: 'hidden',
      cursor: drag ? 'grabbing' : 'grab',
      userSelect: 'none',
      ...style
    },
    onPointerDown: e => {
      setDrag({
        x: e.clientX,
        y: e.clientY,
        rx: rot.x,
        ry: rot.y
      });
      setSpin(false);
    },
    onPointerMove: e => {
      if (!drag) return;
      setRot({
        x: Math.max(-80, Math.min(80, drag.rx - (e.clientY - drag.y) * 0.4)),
        y: drag.ry + (e.clientX - drag.x) * 0.4
      });
    },
    onPointerUp: () => setDrag(null)
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'var(--bg-grid)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      perspective: 1400
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 160,
      height: 160,
      transformStyle: 'preserve-3d',
      transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`
    }
  }, components.map((c, i) => /*#__PURE__*/React.createElement("span", {
    key: c,
    onClick: e => {
      e.stopPropagation();
      onSelect && onSelect(selected === c ? null : c);
    },
    style: {
      position: 'absolute',
      inset: 0,
      transformStyle: 'preserve-3d',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Slab, {
    size: i === 1 ? 96 : 130,
    depth: 26,
    offset: (i - 1) * gap,
    highlight: selected === c,
    muted: selected && selected !== c,
    label: exp ? c : null
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 14,
      left: 16,
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-technical)'
    }
  }, partId, " \xB7 ", exp ? 'EXPLODED' : 'ASSEMBLY'), toolbar && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 14,
      top: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      background: 'rgba(10,11,13,.72)',
      backdropFilter: 'var(--blur-overlay)',
      border: '1px solid var(--border-subtle)',
      padding: 4
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "rotate-3d",
    label: "Auto-rotate",
    size: "sm",
    active: spin,
    onClick: () => setSpin(!spin)
  }), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "layers",
    label: "Exploded view",
    size: "sm",
    active: exp,
    onClick: () => setExp(!exp)
  }), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "ruler",
    label: "Measure",
    size: "sm"
  }), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "sun",
    label: "Lighting",
    size: "sm"
  }), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "maximize",
    label: "Fullscreen",
    size: "sm"
  }), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "rotate-ccw",
    label: "Reset view",
    size: "sm",
    onClick: () => setRot({
      x: -22,
      y: 32
    })
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 16,
      bottom: 14,
      display: 'flex',
      gap: 16,
      font: 'var(--type-technical-sm)',
      color: 'var(--text-disabled)',
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", null, "DRAG \xB7 ROTATE"), /*#__PURE__*/React.createElement("span", null, "SCROLL \xB7 ZOOM")));
}
Object.assign(__ds_scope, { Viewer3D });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/viewer/Viewer3D.jsx", error: String((e && e.message) || e) }); }

// ui_kits/platform/CheckoutScreen.jsx
try { (() => {
const {
  OrderSummary,
  Input,
  Select,
  SectionHeading,
  Panel,
  Radio,
  Button,
  Breadcrumbs
} = window.SADA3DDesignSystem_217828;
function CheckoutScreen({
  cart,
  onComplete
}) {
  const [pay, setPay] = React.useState('UPI');
  const items = cart.length ? cart : [{
    name: 'Precision Gear',
    spec: 'PLA / Black',
    qty: 2,
    price: '₹798'
  }];
  const sub = items.reduce((n, i) => n + (parseInt(String(i.price).replace(/[^0-9]/g, ''), 10) || 0), 0);
  const gst = Math.round(sub * 0.18);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1180,
      margin: '0 auto',
      padding: '32px 32px 96px'
    }
  }, /*#__PURE__*/React.createElement(Breadcrumbs, {
    items: ['Cart', 'Checkout']
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    full: true,
    meta: items.length + ' items'
  }, "Checkout")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 40,
      display: 'grid',
      gridTemplateColumns: '1.3fr 1fr',
      gap: 48,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "Delivery address"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Full name",
    defaultValue: "A. Sharma"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Phone",
    defaultValue: "+91 98450 00000"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Address",
    defaultValue: "14 Residency Road",
    style: {
      gridColumn: '1 / -1'
    }
  }), /*#__PURE__*/React.createElement(Input, {
    label: "City",
    defaultValue: "Bengaluru"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "PIN",
    technical: true,
    defaultValue: "560025"
  }))), /*#__PURE__*/React.createElement(Panel, {
    title: "Shipping"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Radio, {
    name: "ship",
    label: "Standard",
    description: "4\u20136 days \xB7 \u20B980",
    checked: true,
    onChange: () => {}
  }), /*#__PURE__*/React.createElement(Radio, {
    name: "ship",
    label: "Express",
    description: "2 days \xB7 \u20B9240",
    onChange: () => {}
  }))), /*#__PURE__*/React.createElement(Panel, {
    title: "Payment"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, ['UPI', 'Card', 'Net banking'].map(m => /*#__PURE__*/React.createElement(Radio, {
    key: m,
    name: "pay",
    label: m,
    checked: pay === m,
    onChange: () => setPay(m)
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'sticky',
      top: 96,
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    size: "sm"
  }, "Your order"), /*#__PURE__*/React.createElement(OrderSummary, {
    style: {
      marginTop: 20
    },
    items: items,
    totals: [{
      label: 'Subtotal',
      value: '₹' + sub
    }, {
      label: 'Shipping',
      value: '₹80'
    }, {
      label: 'GST 18%',
      value: '₹' + gst
    }],
    total: '₹' + (sub + 80 + gst).toLocaleString('en-IN'),
    onCta: onComplete
  }))));
}
Object.assign(window, {
  CheckoutScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/platform/CheckoutScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/platform/ConfiguratorScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Stepper,
  Panel,
  Viewer3D,
  MaterialCard,
  Radio,
  RangeSlider,
  Select,
  QuantityStepper,
  PriceSummary,
  Button,
  SectionHeading,
  SpecTable,
  Icon
} = window.SADA3DDesignSystem_217828;
const STEPS = ['Upload', 'Material', 'Quality', 'Finish', 'Review'];
function ConfiguratorScreen({
  onCheckout
}) {
  const D = window.SADA_DATA;
  const [step, setStep] = React.useState(1);
  const [mat, setMat] = React.useState('PLA');
  const [quality, setQuality] = React.useState('Fine');
  const [infill, setInfill] = React.useState(20);
  const [qty, setQty] = React.useState(1);
  const [calc, setCalc] = React.useState(false);
  const bump = fn => v => {
    fn(v);
    setCalc(true);
    setTimeout(() => setCalc(false), 700);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1440,
      margin: '0 auto',
      padding: '32px 32px 96px'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    index: "01",
    meta: "PART_00492 \xB7 BRACKET_V3.STL",
    full: true
  }, "Custom print"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 32
    }
  }, /*#__PURE__*/React.createElement(Stepper, {
    steps: STEPS,
    current: step,
    onSelect: setStep
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 40,
      display: 'grid',
      gridTemplateColumns: '1.3fr 1fr 380px',
      gap: 24,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Viewer3D, {
    height: 520,
    partId: "BRACKET_V3",
    components: ['Cap', 'Body', 'Flange']
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }
  }, step === 0 && /*#__PURE__*/React.createElement(Panel, {
    technical: true,
    title: "Upload"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px dashed var(--border-strong)',
      padding: 40,
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "upload",
    size: 28,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase'
    }
  }, "Drop model file"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-disabled)',
      textTransform: 'uppercase'
    }
  }, "STL \xB7 STEP \xB7 OBJ \xB7 3MF"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    onClick: () => setStep(1)
  }, "Browse files"))), step === 1 && /*#__PURE__*/React.createElement(Panel, {
    technical: true,
    title: "Material",
    meta: mat
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 12
    }
  }, D.materials.slice(0, 3).map(m => /*#__PURE__*/React.createElement(MaterialCard, _extends({
    key: m.name
  }, m, {
    selected: mat === m.name,
    onSelect: () => bump(setMat)(m.name)
  }))))), step >= 2 && /*#__PURE__*/React.createElement(Panel, {
    technical: true,
    title: "Quality",
    meta: quality
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, [['Draft', '0.28 mm · fastest'], ['Standard', '0.20 mm · balanced'], ['Fine', '0.16 mm · recommended'], ['Ultra', '0.12 mm · finest detail']].map(([l, d]) => /*#__PURE__*/React.createElement(Radio, {
    key: l,
    name: "quality",
    label: l,
    description: d,
    checked: quality === l,
    onChange: () => bump(setQuality)(l)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(RangeSlider, {
    label: "Infill",
    min: 10,
    max: 100,
    step: 5,
    value: infill,
    format: v => v + '%',
    onChange: e => bump(setInfill)(+e.target.value)
  }))), /*#__PURE__*/React.createElement(Panel, {
    technical: true,
    title: "Options"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Finish",
    options: ['As printed', 'Sanded', 'Vapour smoothed', 'Painted']
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Colour",
    options: ['Black', 'Titanium', 'White', 'Titanium Orange']
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, "Quantity"), /*#__PURE__*/React.createElement(QuantityStepper, {
    value: qty,
    onChange: bump(setQty)
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      position: 'sticky',
      top: 96
    }
  }, /*#__PURE__*/React.createElement(PriceSummary, {
    state: calc ? 'updating' : 'valid',
    price: '₹' + 387 * qty,
    analysis: [{
      label: 'Volume',
      value: '48.3 cm³'
    }, {
      label: 'Weight',
      value: '42.6 g'
    }, {
      label: 'Print time',
      value: '3h 24m'
    }, {
      label: 'Material',
      value: mat
    }, {
      label: 'Infill',
      value: infill + '%'
    }],
    note: "Price excl. GST \xB7 min order \u20B9150",
    cta: "Add to cart",
    onCta: onCheckout
  }), /*#__PURE__*/React.createElement(Panel, {
    technical: true,
    title: "Geometry check",
    meta: "PASSED"
  }, /*#__PURE__*/React.createElement(SpecTable, {
    dense: true,
    rows: [{
      label: 'Watertight',
      value: 'YES'
    }, {
      label: 'Wall thickness',
      value: '2.4 MM MIN'
    }, {
      label: 'Overhangs',
      value: '3 · SUPPORTED'
    }, {
      label: 'Bounding box',
      value: '80 × 40 × 20 MM'
    }]
  })))));
}
Object.assign(window, {
  ConfiguratorScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/platform/ConfiguratorScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/platform/HomeScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Button,
  SectionHeading,
  ProductCard,
  MaterialCard,
  Viewer3D,
  Icon
} = window.SADA3DDesignSystem_217828;
function Hero({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      background: 'var(--gradient-hero)',
      borderBottom: '1px solid var(--border-subtle)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'var(--bg-grid-lg)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 1440,
      margin: '0 auto',
      padding: '0 32px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 48,
      alignItems: 'center',
      minHeight: 620
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 28,
      padding: '80px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-accent)',
      letterSpacing: 'var(--ls-eyebrow)',
      textTransform: 'uppercase'
    }
  }, "Digital to physical"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 'var(--fs-display-2)',
      lineHeight: .94,
      letterSpacing: '-.02em',
      textTransform: 'uppercase'
    }
  }, "Manufacturing,", /*#__PURE__*/React.createElement("br", null), "Reimagined."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      maxWidth: 460,
      font: 'var(--type-body-lg)',
      color: 'var(--text-secondary)'
    }
  }, "Transform digital designs into physical products through advanced on-demand 3D manufacturing."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    onClick: () => onNavigate('Custom Print')
  }, "Start Printing"), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    variant: "secondary",
    onClick: () => onNavigate('Shop')
  }, "Explore Designs")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 32,
      paddingTop: 12,
      borderTop: '1px solid var(--border-subtle)'
    }
  }, [['12', 'MACHINES ONLINE'], ['48H', 'TYPICAL LEAD TIME'], ['±0.1', 'MM TOLERANCE']].map(([v, l]) => /*#__PURE__*/React.createElement("div", {
    key: l
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--fw-medium) 22px/1 var(--font-technical)',
      color: 'var(--text-primary)',
      paddingTop: 16
    }
  }, v), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      font: 'var(--type-technical-sm)',
      color: 'var(--text-disabled)',
      letterSpacing: '.12em'
    }
  }, l))))), /*#__PURE__*/React.createElement(Viewer3D, {
    height: 520,
    toolbar: false,
    partId: "SADA_HERO_01",
    components: ['Housing', 'Gear', 'Base'],
    style: {
      background: 'transparent',
      border: 0
    }
  })));
}
function Section({
  index,
  title,
  meta,
  children,
  background
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: background || 'var(--surface-page)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1440,
      margin: '0 auto',
      padding: '96px 32px'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    index: index,
    meta: meta,
    full: true
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 40
    }
  }, children)));
}
function HomeScreen({
  onNavigate,
  onOpenProduct
}) {
  const D = window.SADA_DATA;
  const [mat, setMat] = React.useState('PLA');
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Hero, {
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement(Section, {
    index: "02",
    title: "Discover",
    meta: "08 categories",
    background: "var(--graphite)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 1,
      background: 'var(--border-subtle)',
      border: '1px solid var(--border-subtle)'
    }
  }, D.categories.map((c, i) => /*#__PURE__*/React.createElement("a", {
    key: c,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('Shop');
    },
    style: {
      borderBottom: 0,
      background: 'var(--surface-card)',
      padding: '28px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 40,
      minHeight: 160,
      transition: 'var(--transition-control)'
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = 'var(--surface-raised)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'var(--surface-card)';
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-disabled)'
    }
  }, String(i + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 'auto',
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 17,
      textTransform: 'uppercase',
      letterSpacing: '.04em',
      color: 'var(--text-primary)'
    }
  }, c))))), /*#__PURE__*/React.createElement(Section, {
    index: "03",
    title: "Custom Manufacturing",
    meta: "STL \xB7 STEP \xB7 OBJ"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 48,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 'var(--fs-display-3)',
      lineHeight: 1.02,
      textTransform: 'uppercase'
    }
  }, "Your design.", /*#__PURE__*/React.createElement("br", null), "Our machines.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-accent)'
    }
  }, "Physical reality.")), /*#__PURE__*/React.createElement("p", {
    style: {
      maxWidth: 420,
      font: 'var(--type-body)',
      color: 'var(--text-secondary)'
    }
  }, "Upload a model, inspect it in the browser, choose material and quality, and see the manufacturing price update as you configure."), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    iconLeft: "upload",
    onClick: () => onNavigate('Custom Print')
  }, "Upload Design")), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px dashed var(--border-strong)',
      background: 'var(--surface-panel)',
      padding: 48,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "box",
    size: 32,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase'
    }
  }, "Drop a model file"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-disabled)',
      textTransform: 'uppercase'
    }
  }, "STL \xB7 STEP \xB7 OBJ \xB7 3MF \xB7 MAX 250 MB")))), /*#__PURE__*/React.createElement(Section, {
    index: "04",
    title: "Materials",
    meta: "05 available",
    background: "var(--graphite)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5,1fr)',
      gap: 16
    }
  }, D.materials.map(m => /*#__PURE__*/React.createElement(MaterialCard, _extends({
    key: m.name
  }, m, {
    selected: mat === m.name,
    onSelect: () => setMat(m.name)
  }))))), /*#__PURE__*/React.createElement(Section, {
    index: "05",
    title: "Explore Products",
    meta: "248 parts"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 20
    }
  }, D.products.slice(0, 4).map(p => /*#__PURE__*/React.createElement(ProductCard, _extends({
    key: p.name
  }, p, {
    onView: () => onOpenProduct(p)
  }))))), /*#__PURE__*/React.createElement(Section, {
    index: "06",
    title: "How It Works",
    meta: "04 stages",
    background: "var(--graphite)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 24
    }
  }, [['Upload', 'STL, STEP or OBJ. Geometry is verified on arrival.'], ['Configure', 'Material, layer height, infill, finish and quantity.'], ['Manufacture', 'Queued to a calibrated machine and monitored end to end.'], ['Deliver', 'Inspected, packed and dispatched with the part report.']].map(([t, d], i) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      paddingTop: 20,
      borderTop: '2px solid ' + (i === 0 ? 'var(--orange-500)' : 'var(--border-default)')
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-accent)'
    }
  }, String(i + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 18,
      textTransform: 'uppercase',
      letterSpacing: '.04em'
    }
  }, t), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      font: 'var(--type-body-sm)',
      color: 'var(--text-secondary)'
    }
  }, d))))), /*#__PURE__*/React.createElement(Section, {
    index: "07",
    title: "Applications",
    meta: "industries"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 20
    }
  }, [['Automotive', 'Jigs, fixtures and interior components produced in days, not weeks.'], ['Industrial', 'Replacement parts and low-volume runs for machinery already in service.'], ['Product development', 'Iterate physical prototypes alongside the CAD model.']].map(([t, d]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      padding: 28
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 18,
      textTransform: 'uppercase',
      letterSpacing: '.04em'
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 2,
      width: 40,
      margin: '14px 0',
      background: 'var(--gradient-orange-line)'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-body-sm)',
      color: 'var(--text-secondary)'
    }
  }, d))))), /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      background: 'var(--void)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'var(--bg-grid)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 1440,
      margin: '0 auto',
      padding: '128px 32px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 'var(--fs-display-2)',
      lineHeight: .94,
      textTransform: 'uppercase',
      letterSpacing: '-.02em'
    }
  }, "Manufacturing,", /*#__PURE__*/React.createElement("br", null), "Reimagined."), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 2,
      width: 120,
      margin: '32px auto',
      background: 'var(--gradient-orange-line)',
      boxShadow: 'var(--glow-line)'
    }
  }), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    onClick: () => onNavigate('Custom Print')
  }, "Start Printing"))));
}
Object.assign(window, {
  HomeScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/platform/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/platform/MarketplaceScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  SectionHeading,
  ProductCard,
  FilterTree,
  Tag,
  Button,
  Select,
  Breadcrumbs
} = window.SADA3DDesignSystem_217828;
function MarketplaceScreen({
  onOpenProduct
}) {
  const D = window.SADA_DATA;
  const [sel, setSel] = React.useState(['Mechanical', 'PLA']);
  const toggle = l => setSel(s => s.includes(l) ? s.filter(x => x !== l) : [...s, l]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1440,
      margin: '0 auto',
      padding: '32px 32px 96px',
      display: 'grid',
      gridTemplateColumns: '280px 1fr',
      gap: 48,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      position: 'sticky',
      top: 96
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    size: "sm",
    meta: sel.length ? sel.length + ' active' : null
  }, "Filters"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(FilterTree, {
    groups: D.filters,
    selected: sel,
    onToggle: toggle
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    onClick: () => setSel([])
  }, "Clear all"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "Apply"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Breadcrumbs, {
    items: ['Shop', 'All parts']
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 24,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 'var(--fs-h1)',
      textTransform: 'uppercase',
      letterSpacing: '-.01em'
    }
  }, "All parts"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 2,
      width: 48,
      marginTop: 12,
      background: 'var(--gradient-orange-line)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase'
    }
  }, "248 results"), /*#__PURE__*/React.createElement(Select, {
    options: ['Sort: Relevance', 'Sort: Price low → high', 'Sort: Fastest lead time'],
    style: {
      minWidth: 220
    }
  }))), sel.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      marginTop: 24
    }
  }, sel.map(s => /*#__PURE__*/React.createElement(Tag, {
    key: s,
    tone: "accent",
    onRemove: () => toggle(s)
  }, s))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 28,
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 20
    }
  }, D.products.map(p => /*#__PURE__*/React.createElement(ProductCard, _extends({
    key: p.name
  }, p, {
    onView: () => onOpenProduct(p)
  }))))));
}
Object.assign(window, {
  MarketplaceScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/platform/MarketplaceScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/platform/ProductScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Button,
  Viewer3D,
  SpecTable,
  SectionHeading,
  Tag,
  QuantityStepper,
  Select,
  Breadcrumbs,
  Panel,
  ProductCard,
  StatusDot
} = window.SADA3DDesignSystem_217828;
function ProductScreen({
  product,
  onAddToCart,
  onOpenProduct
}) {
  const D = window.SADA_DATA;
  const p = product || D.products[0];
  const [qty, setQty] = React.useState(1);
  const [part, setPart] = React.useState(null);
  const [added, setAdded] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1440,
      margin: '0 auto',
      padding: '32px 32px 96px'
    }
  }, /*#__PURE__*/React.createElement(Breadcrumbs, {
    items: ['Shop', 'Mechanical', p.name]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      display: 'grid',
      gridTemplateColumns: '1.25fr 1fr',
      gap: 48,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Viewer3D, {
    height: 560,
    selected: part,
    onSelect: setPart,
    partId: "PART_00492"
  }), part && /*#__PURE__*/React.createElement(Panel, {
    technical: true,
    title: "Component inspection",
    meta: part.toUpperCase(),
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(SpecTable, {
    dense: true,
    rows: [{
      label: 'Component',
      value: part
    }, {
      label: 'Material',
      value: p.material
    }, {
      label: 'Bounding box',
      value: '38 × 38 × 12 MM'
    }],
    highlightKeys: ['Component']
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Tag, {
    tone: "accent"
  }, p.material), /*#__PURE__*/React.createElement(Tag, null, "FDM")), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 'var(--fs-h1)',
      textTransform: 'uppercase',
      letterSpacing: '-.01em'
    }
  }, p.name), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 2,
      width: 48,
      margin: '16px 0',
      background: 'var(--gradient-orange-line)'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-body)',
      color: 'var(--text-secondary)',
      maxWidth: 460
    }
  }, "A calibrated spur gear for low-torque drive assemblies. Printed at 0.16 mm and dimensionally verified against the source model before dispatch.")), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--fw-medium) 34px/1 var(--font-technical)'
    }
  }, p.price), /*#__PURE__*/React.createElement(StatusDot, {
    status: "delivered",
    label: "In stock \xB7 ships in 48h"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Material",
    options: D.materials.map(m => m.name),
    defaultValue: p.material
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Colour",
    options: ['Black', 'Titanium', 'White', 'Titanium Orange']
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Quality",
    options: ['Standard · 0.20 mm', 'Fine · 0.16 mm', 'Ultra · 0.12 mm'],
    defaultValue: "Fine \xB7 0.16 mm"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, "Quantity"), /*#__PURE__*/React.createElement(QuantityStepper, {
    value: qty,
    onChange: setQty
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    success: added,
    onClick: () => {
      setAdded(true);
      onAddToCart(p, qty);
    },
    style: {
      flex: 1
    }
  }, added ? 'Added to cart' : 'Add to cart'), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    variant: "secondary",
    iconLeft: "upload"
  }, "Print my own")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionHeading, {
    size: "sm",
    meta: "PART_00492"
  }, "Technical specifications"), /*#__PURE__*/React.createElement(SpecTable, {
    style: {
      marginTop: 16
    },
    rows: D.specs,
    highlightKeys: ['Layer height', 'Est. print time']
  })))), /*#__PURE__*/React.createElement("section", {
    style: {
      marginTop: 96
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    index: "\u2014",
    meta: "04 parts",
    full: true
  }, "Related parts"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 32,
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 20
    }
  }, D.products.slice(1, 5).map(r => /*#__PURE__*/React.createElement(ProductCard, _extends({
    key: r.name
  }, r, {
    onView: () => onOpenProduct(r)
  }))))));
}
Object.assign(window, {
  ProductScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/platform/ProductScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/platform/Shell.jsx
try { (() => {
const {
  Header
} = window.SADA3DDesignSystem_217828;
function Footer() {
  const cols = [['Shop', ['Mechanical', 'Automotive', 'Industrial', 'Lifestyle']], ['Manufacture', ['Custom print', 'Materials', 'Tolerances', 'File formats']], ['Company', ['About', 'Facilities', 'Careers', 'Contact']]];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      borderTop: '1px solid var(--border-subtle)',
      background: 'var(--void)',
      padding: '56px 32px 40px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1440,
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: '1.4fr repeat(3,1fr)',
      gap: 40
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 17,
      letterSpacing: '.16em',
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", null, "SADA"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-accent)'
    }
  }, "3D")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 2,
      width: 48,
      margin: '14px 0',
      background: 'var(--gradient-orange-line)'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-technical-sm)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '.14em'
    }
  }, "Manufacturing, reimagined.")), cols.map(([t, items]) => /*#__PURE__*/React.createElement("div", {
    key: t
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-label)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--text-primary)'
    }
  }, t), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: '16px 0 0',
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, items.map(i => /*#__PURE__*/React.createElement("li", {
    key: i
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      font: 'var(--type-body-sm)',
      color: 'var(--text-muted)',
      borderBottom: 0
    }
  }, i))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1440,
      margin: '48px auto 0',
      paddingTop: 20,
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex',
      justifyContent: 'space-between',
      font: 'var(--type-technical-sm)',
      color: 'var(--text-disabled)',
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 SADA 3D MANUFACTURING"), /*#__PURE__*/React.createElement("span", null, "BENGALURU \xB7 IN")));
}
function Shell({
  view,
  onNavigate,
  cartCount,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      background: 'var(--surface-page)'
    }
  }, /*#__PURE__*/React.createElement(Header, {
    active: view,
    cartCount: cartCount,
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement("main", null, children), /*#__PURE__*/React.createElement(Footer, null));
}
Object.assign(window, {
  Shell,
  Footer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/platform/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/platform/TrackingScreen.jsx
try { (() => {
const {
  ManufacturingTimeline,
  Panel,
  SpecTable,
  SectionHeading,
  Tag,
  StatusDot,
  Button,
  Breadcrumbs
} = window.SADA3DDesignSystem_217828;
function TrackingScreen() {
  const [t, setT] = React.useState(68);
  React.useEffect(() => {
    const id = setInterval(() => setT(v => v >= 99 ? 68 : v + 1), 2600);
    return () => clearInterval(id);
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1180,
      margin: '0 auto',
      padding: '32px 32px 96px'
    }
  }, /*#__PURE__*/React.createElement(Breadcrumbs, {
    items: ['Account', 'Orders', 'SD-24081']
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    meta: "ORDER SD-24081"
  }, "Manufacturing status"), /*#__PURE__*/React.createElement(StatusDot, {
    status: "printing",
    pulse: true,
    label: "Printing"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 40,
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr',
      gap: 48,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(ManufacturingTimeline, {
    stages: [{
      label: 'Design verified',
      state: 'complete',
      meta: '09:02'
    }, {
      label: 'File processed',
      state: 'complete',
      meta: '09:14'
    }, {
      label: 'Material prepared',
      state: 'complete',
      meta: '09:31'
    }, {
      label: 'Printing',
      state: 'active',
      progress: t,
      meta: 'SADA-FDM-07'
    }, {
      label: 'Quality check'
    }, {
      label: 'Packaging'
    }, {
      label: 'Shipping'
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      position: 'sticky',
      top: 96
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    technical: true,
    title: "Machine",
    meta: "ONLINE"
  }, /*#__PURE__*/React.createElement(SpecTable, {
    dense: true,
    rows: [{
      label: 'Printer',
      value: 'SADA-FDM-07'
    }, {
      label: 'Material',
      value: 'PLA / BLACK'
    }, {
      label: 'Nozzle',
      value: '0.4 MM'
    }, {
      label: 'Layer',
      value: '0.16 MM'
    }, {
      label: 'Est. completion',
      value: '01:42:18'
    }],
    highlightKeys: ['Est. completion']
  })), /*#__PURE__*/React.createElement(Panel, {
    title: "Part",
    meta: "PART_00492"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(Tag, {
    tone: "accent"
  }, "PLA"), /*#__PURE__*/React.createElement(Tag, null, "FDM"), /*#__PURE__*/React.createElement(Tag, {
    tone: "success"
  }, "Verified")), /*#__PURE__*/React.createElement(SpecTable, {
    dense: true,
    rows: [{
      label: 'Quantity',
      value: '02'
    }, {
      label: 'Dimensions',
      value: '80 × 40 × 20 MM'
    }, {
      label: 'Weight',
      value: '34 G EACH'
    }]
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    fullWidth: true,
    style: {
      marginTop: 20
    }
  }, "Download part report")))));
}
Object.assign(window, {
  TrackingScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/platform/TrackingScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/platform/data.js
try { (() => {
// Shared demo data for the SADA 3D platform UI kit.
window.SADA_DATA = {
  products: [{
    name: 'Precision Gear',
    material: 'PLA',
    color: 'Black',
    price: '₹399',
    badge: 'In stock',
    meta: [{
      label: 'Layer',
      value: '0.16 MM'
    }, {
      label: 'Weight',
      value: '34 G'
    }]
  }, {
    name: 'Cable Bracket',
    material: 'PETG',
    color: 'Graphite',
    price: '₹249',
    meta: [{
      label: 'Layer',
      value: '0.20 MM'
    }, {
      label: 'Weight',
      value: '21 G'
    }]
  }, {
    name: 'Hex Drive Coupler',
    material: 'ABS',
    color: 'Titanium',
    price: '₹640',
    badge: 'New',
    meta: [{
      label: 'Layer',
      value: '0.12 MM'
    }, {
      label: 'Weight',
      value: '58 G'
    }]
  }, {
    name: 'Damping Bushing',
    material: 'TPU',
    color: 'Black',
    price: '₹180',
    meta: [{
      label: 'Shore',
      value: '95A'
    }, {
      label: 'Weight',
      value: '12 G'
    }]
  }, {
    name: 'Optical Mount',
    material: 'Resin',
    color: 'Grey',
    price: '₹1,240',
    badge: 'SLA',
    meta: [{
      label: 'Layer',
      value: '0.05 MM'
    }, {
      label: 'Weight',
      value: '46 G'
    }]
  }, {
    name: 'Manifold Housing',
    material: 'PETG',
    color: 'Carbon',
    price: '₹890',
    meta: [{
      label: 'Layer',
      value: '0.16 MM'
    }, {
      label: 'Weight',
      value: '112 G'
    }]
  }, {
    name: 'Planetary Carrier',
    material: 'PLA',
    color: 'Orange',
    price: '₹520',
    meta: [{
      label: 'Layer',
      value: '0.16 MM'
    }, {
      label: 'Weight',
      value: '61 G'
    }]
  }, {
    name: 'Sensor Enclosure',
    material: 'ABS',
    color: 'Black',
    price: '₹760',
    meta: [{
      label: 'Layer',
      value: '0.20 MM'
    }, {
      label: 'Weight',
      value: '88 G'
    }]
  }],
  categories: ['Mechanical', 'Automotive', 'Industrial', 'Lifestyle', 'Architecture', 'Prototyping', 'Components', 'Custom Products'],
  materials: [{
    name: 'PLA',
    code: 'Polylactic acid',
    description: 'The default. Dimensionally stable, sharp detail, matte finish.',
    properties: {
      strength: 3,
      flexibility: 2,
      heat: 2
    },
    colors: ['#F4F6F8', '#050506', '#FF6B00', '#6C737C'],
    multiplier: '1.0'
  }, {
    name: 'PETG',
    code: 'Glycol-modified PET',
    description: 'Tougher and chemically resistant. Semi-gloss surface.',
    properties: {
      strength: 4,
      flexibility: 3,
      heat: 4
    },
    colors: ['#F4F6F8', '#050506', '#4DA3FF'],
    multiplier: '1.2'
  }, {
    name: 'ABS',
    code: 'Acrylonitrile butadiene styrene',
    description: 'Impact resistant, machinable, vapour-smoothable.',
    properties: {
      strength: 4,
      flexibility: 3,
      heat: 5
    },
    colors: ['#050506', '#A9B0B9'],
    multiplier: '1.3'
  }, {
    name: 'TPU',
    code: 'Thermoplastic polyurethane',
    description: 'Elastomeric. Gaskets, dampers, protective housings.',
    properties: {
      strength: 3,
      flexibility: 5,
      heat: 3
    },
    colors: ['#050506', '#FF6B00'],
    multiplier: '1.6'
  }, {
    name: 'Resin',
    code: 'SLA photopolymer',
    description: 'Highest resolution. Fine features and smooth surfaces.',
    properties: {
      strength: 3,
      flexibility: 1,
      heat: 3
    },
    colors: ['#A9B0B9', '#050506'],
    multiplier: '2.1'
  }],
  filters: [{
    label: 'Category',
    options: [{
      label: 'Functional',
      count: 128,
      defaultOpen: true,
      children: [{
        label: 'Mechanical',
        count: 64,
        children: [{
          label: 'Gears',
          count: 22
        }, {
          label: 'Brackets',
          count: 18
        }, {
          label: 'Tools',
          count: 24
        }]
      }, {
        label: 'Fasteners',
        count: 31
      }]
    }, {
      label: 'Automotive',
      count: 38,
      children: [{
        label: 'Interior',
        count: 12
      }, {
        label: 'Exterior',
        count: 14
      }, {
        label: 'Components',
        count: 12
      }]
    }, {
      label: 'Lifestyle',
      count: 51,
      children: [{
        label: 'Home',
        count: 20
      }, {
        label: 'Decor',
        count: 16
      }, {
        label: 'Organization',
        count: 15
      }]
    }]
  }, {
    label: 'Material',
    options: [{
      label: 'PLA',
      count: 120
    }, {
      label: 'PETG',
      count: 64
    }, {
      label: 'ABS',
      count: 31
    }, {
      label: 'TPU',
      count: 18
    }, {
      label: 'Resin',
      count: 27
    }]
  }, {
    label: 'Print technology',
    options: [{
      label: 'FDM',
      count: 180
    }, {
      label: 'SLA',
      count: 44
    }, {
      label: 'SLS',
      count: 12
    }]
  }, {
    label: 'Availability',
    defaultOpen: false,
    options: [{
      label: 'In stock',
      count: 204
    }, {
      label: 'Made to order',
      count: 32
    }]
  }],
  specs: [{
    label: 'Print technology',
    value: 'FDM'
  }, {
    label: 'Material',
    value: 'PLA'
  }, {
    label: 'Layer height',
    value: '0.16 MM'
  }, {
    label: 'Infill',
    value: '20%'
  }, {
    label: 'Dimensions',
    value: '80 × 40 × 20 MM'
  }, {
    label: 'Est. print time',
    value: '02:48:12'
  }, {
    label: 'Weight',
    value: '34 G'
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/platform/data.js", error: String((e && e.message) || e) }); }

__ds_ns.MaterialCard = __ds_scope.MaterialCard;

__ds_ns.OrderSummary = __ds_scope.OrderSummary;

__ds_ns.PriceSummary = __ds_scope.PriceSummary;

__ds_ns.ProductCard = __ds_scope.ProductCard;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.StatusDot = __ds_scope.StatusDot;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.QuantityStepper = __ds_scope.QuantityStepper;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.RangeSlider = __ds_scope.RangeSlider;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.ManufacturingTimeline = __ds_scope.ManufacturingTimeline;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.FilterTree = __ds_scope.FilterTree;

__ds_ns.Header = __ds_scope.Header;

__ds_ns.Breadcrumbs = __ds_scope.Breadcrumbs;

__ds_ns.Panel = __ds_scope.Panel;

__ds_ns.SectionHeading = __ds_scope.SectionHeading;

__ds_ns.SpecTable = __ds_scope.SpecTable;

__ds_ns.Stepper = __ds_scope.Stepper;

__ds_ns.Viewer3D = __ds_scope.Viewer3D;

})();
