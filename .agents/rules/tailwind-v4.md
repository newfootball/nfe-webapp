---
paths:
  - "app/**/*.css"
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "apps/start/src/**/*.css"
  - "apps/start/src/**/*.tsx"
---

# Tailwind CSS

Scope: app/**/*.css, app/**/*.tsx, components/**/*.tsx, apps/start/src/**/*.css, apps/start/src/**/*.tsx

- Follow the installed Tailwind version and the project's established configuration style.
- In Tailwind v4, define utility-generating design tokens with top-level `@theme` variables; use ordinary CSS custom properties when no utility is needed.
- Keep utility names complete and statically detectable; map variants to full class strings instead of interpolating fragments. Use CSS custom properties for runtime values and the installed version's source-registration mechanism when required files are outside automatic detection.
- Reuse semantic project tokens for product colors, typography, spacing, and states when they exist. One-off values are acceptable when they express a genuinely local design decision.
- Preserve accessible contrast, visible focus indicators, responsive behavior, and motion preferences when composing utilities.
- Avoid scattering repeated class recipes: extract a component, variant, or shared style only after repetition makes that clearer.

## Local theme

- Root Tailwind 4.2 uses PostCSS; Start Tailwind 4.3 uses the Vite plugin.
  Do not add a v3 configuration or replace these integrations during UI work.
- Root semantic variables and shadcn tokens live in `app/globals.css`; preserve
  existing CSS-variable and `@theme` conventions. Start reuses the root tokens
  through `apps/start/src/styles.css`.
- Extend application-owned primitives in `components/ui`, retaining accessible
  semantics, keyboard behavior and focus. Keep feature-specific UI under
  `components/feature` and use the existing `cn` utility and lucide icons.
