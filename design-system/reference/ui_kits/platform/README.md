# SADA 3D — Platform UI kit

An interactive recreation of the SADA 3D commerce + manufacturing platform, composed entirely from this design system's components.

Open `index.html`. Flow:

1. **Home** — hero (3D object stage), Discover categories, Custom Manufacturing, Materials, Explore Products, How It Works, Applications, final CTA.
2. **Shop** (`MarketplaceScreen`) — three-level nested filter sidebar, active filter chips, result count, sort, product grid.
3. **Product** (`ProductScreen`) — 3D viewer with exploded view and component inspection, buy panel, technical specifications, related parts.
4. **Custom Print** (`ConfiguratorScreen`) — 5-step flow, viewer, material / quality / infill / finish, live price panel, geometry check.
5. **Checkout** (`CheckoutScreen`) — address, shipping, payment, order summary with GST.
6. **Tracking** (`TrackingScreen`) — seven-stage manufacturing timeline with live printing progress, machine panel, part panel.

Cart badge, add-to-cart, filter toggles, stepper, viewer rotation and exploded view are all live. `data.js` holds the demo content.
