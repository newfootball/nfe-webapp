---
paths:
  - "apps/start/src/lib/**"
  - "tools/**"
---

# Zod validation

Scope: apps/start/src/lib/**, tools/**

- Validate untrusted input at system boundaries: requests, forms, environment configuration, webhooks, and third-party responses.
- Use `parse` when invalid input should stop execution and `safeParse` when the caller must handle validation failure as data.
- Derive TypeScript types from the schema when practical so runtime validation and static types stay aligned.
- Reject or explicitly handle unknown fields for security-sensitive payloads; do not silently pass unvalidated values to persistence or privileged operations.
- Keep schemas reusable but close enough to their boundary that error messages and authorization context remain clear.
- Check the installed major before adopting examples. In Zod 4, report errors through `.issues`; distinguish `z.input` from `z.output` when coercion, defaults or transforms change the value type. Use async parsing for async refinements or transforms.
- Make coercion intentional: JavaScript boolean coercion turns a nonempty string such as `"false"` into `true`. Parse textual flags explicitly, and use strict object validation when unexpected fields must be rejected rather than silently stripped.

## Local validation

- Installed Zod is v4. Use `.issues` for errors.
- Client form validation is user feedback; repeat parsing on the server before
  persistence and keep authorization separate from schema validity.
- Start uses separate public and server environment modules
  (`src/lib/env-public.ts`, `src/lib/env.server.ts`).
