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
| Body, labels, UI text | Inter (default) | — |

Oswald is loaded globally via `next/font/google` with CSS var `--font-oswald`.  
Tailwind utility: `font-oswald` (declared in `globals.css` via `@theme inline`).

### Title pattern
```tsx
<h1 className="font-oswald text-2xl font-bold tracking-wide uppercase">
  Page Title
</h1>
```

## Layout

- **Mobile-first**, max-width container centered
- Top nav: NFE logo centered, actions right (bell, avatar)
- Bottom nav: Accueil / Rechercher / + (FAB yellow) / Messages / Profil
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
