# NFE Design System

Reference guide for UI decisions. Read this before building any new page or component.

## Brand

| Token | Value |
|---|---|
| Primary | `#F5C842` (yellow/gold) |
| Primary foreground | `#1c1400` (dark brown) |
| Background | `#ffffff` |
| Stone base | Shadcn Stone palette |

One accent color only: **yellow**. No per-type or per-category colors in the UI (no red/blue/green per notification type, etc.).

## Typography

| Role | Font | Class |
|---|---|---|
| Page titles, section headers | Oswald | `font-oswald uppercase tracking-wide` |
| Display numbers, hero titles | Oswald 300–500 | `font-display uppercase` |
| Body, UI text | Barlow 400–600 | `font-sans` (default) |
| Kickers, small caps labels | Barlow Condensed 500 | `font-label uppercase tracking-[0.16em]` |

Fonts are self-hosted with `@fontsource` (latin subsets) in `apps/start/src/styles.css`.
Tailwind utilities `font-oswald`, `font-display`, `font-label` and `font-sans` are declared in `globals.css`.

### Strokes and rules
- Icons: 1.25 px stroke, round caps (`components/home/icon.tsx`).
- Separators: 1 px hairlines (`border-hair`) instead of cards and shadows.
- Yellow stays a highlighter: one mark, one active state or one CTA per screen.
- Football vocabulary over generic UI: jersey number avatar, poste · club, score and minute.

### Title pattern
```tsx
<h1 className="font-oswald text-2xl font-bold tracking-wide uppercase">
  Page Title
</h1>
```

## Layout

- **Mobile-first**, max-width container centered
- Top nav: ball + NFE logo left, actions right (bell, jersey avatar with yellow ring)
- Secondary nav: text links on a hairline, active link underlined
- Home ("D · Synthèse"): Ta semaine → L’action de la semaine → Vestiaire → Le fil
- Videos in the feed go edge to edge on mobile, with a broadcast bug (score, minute) when match data is set
- Page content: `<Layout>` wrapper with standard padding

## Components

### Unread / Active state
- Left border stripe `w-1 bg-primary rounded-l`
- Card background: `bg-white shadow-sm border-transparent`
- Timestamp: `text-amber-600`
- Dot indicator: `h-2 w-2 rounded-full bg-primary`
- Badge: `bg-primary text-primary-foreground px-2.5 py-1 rounded-full text-xs font-semibold`

### Read / Inactive state
- No border stripe
- Card background: `bg-stone-50 border-stone-100`
- Text: `text-stone-400`
- Timestamp: `text-stone-300`

### Notification card (Variant C)
```tsx
<div className="relative flex items-center gap-3 rounded-xl border px-4 py-3 overflow-hidden
  bg-white border-transparent shadow-sm">           // unread
  // OR
  bg-stone-50 border-stone-100">                   // read

  {isUnread && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-xl" />}
  
  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100">
    <Icon className="h-4 w-4 text-stone-500" />
  </div>
  
  <div className="flex-1 min-w-0">
    <p className="text-sm font-semibold">Name</p>
    <p className="text-sm text-stone-600 mt-0.5">action text</p>
  </div>
  
  <div className="flex flex-col items-end gap-1.5 shrink-0">
    <span className="text-xs text-amber-600">2m</span>    // unread
    <div className="h-2 w-2 rounded-full bg-primary" />   // unread dot
  </div>
</div>
```

### Empty state
```tsx
<div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
  <Icon className="h-10 w-10" />
  <p className="text-sm">{t("empty")}</p>
</div>
```

### Dashed empty state (clickable, e.g. comments)
```tsx
<button className="w-full py-6 flex flex-col items-center gap-1 rounded-xl
  border border-dashed border-border
  hover:border-primary/40 hover:bg-muted/30 transition-colors">
  <span className="text-sm font-medium">{t("no-items")}</span>
  <span className="text-xs text-muted-foreground">{t("cta")}</span>
</button>
```

## Decisions log

| Date | Decision | Reason |
|---|---|---|
| 2026-05 | Single yellow accent, no per-type colors | Brand consistency, user preference |
| 2026-05 | Oswald for page/section titles | Sports aesthetic, matches NFE brand |
| 2026-05 | Notification cards: Variant C (left stripe + name/action split) | Chosen from 3-variant design challenge |
| 2026-05 | Direct Cloudinary upload (client-side XHR) | Bypasses Vercel 4.5MB body limit |
| 2026-11 | Home "D · Synthèse", Barlow body, thin strokes and hairlines | Avoid the generic "AI" look; football broadcast cues |
| 2026-11 | Bottom nav with FAB dropped for now | Not part of home D; publish lives in the feed header |
