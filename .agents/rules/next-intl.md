---
paths:
  - "app/**"
  - "components/**"
  - "src/i18n/**"
  - "src/actions/**"
  - "messages/**"
---

# Internationalization

Scope: app/**, components/**, src/i18n/**, src/actions/**, messages/**

- Use the library's server or client API in the matching rendering context.
- Use awaitable `getTranslations` in async Server Components/actions; `useTranslations` also supports non-async Server Components, so using translations alone does not require `"use client"`. Pass translated props or the needed messages through `NextIntlClientProvider` for client UI; functions are not serializable props.
- Use the project's locale-aware navigation helpers when configured; do not bypass locale routing with raw links or redirects.
- Add a message key to every supported locale, with the same placeholders and ICU plural/select branches.
- Keep messages organized by feature or page. Use interpolation and rich-text APIs rather than building translated sentences through concatenation.
- Format dates, numbers, and currency with the active locale; do not hard-code a locale, currency, or date format in reusable UI.

## Locale selection

- `src/i18n/request.ts`: valid `NEXT_LOCALE` cookie, then `Accept-Language`, then
  French fallback. Supported locales are `fr` and `en`; there is no root `[locale]`
  route group to impose on the Next app.
- Use server `getTranslations()` and client `useTranslations()` as appropriate.
  Keep `messages/fr.json` and `messages/en.json` aligned, including placeholders.
- Do not apply this setup to Start: its URL locales and messages are independent.
