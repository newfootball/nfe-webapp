# Server Functions and Actions

Scope: server-callable functions and action handlers, including private reads and mutations.

- Treat every Server Function/Action as a callable endpoint. Validate untrusted input at runtime; authenticate protected operations and authorize access to the specific resource on every invocation, including private reads. Public operations still need their own input and abuse controls.
- Do not rely on hidden form fields, client-side role checks, or page-level guards for authorization.
- Keep mutations small and explicit. Use a transaction when multiple durable changes must be atomic.
- Revalidate or update only the cache entries affected after a successful mutation.
- Return expected validation failures in a form the UI can render; avoid exposing internal errors, secrets, or stack traces.
- Configure any cross-origin action access narrowly and only when the deployment requires it.

## Project contracts

- Root Next mutations live in `src/actions`; protected reads in `src/query` need
  the same authorization scrutiny. A client layout redirect grants no authority.
- Check `getUserSessionId()` from `src/query/user.query.ts`, reject null before
  private filters, and enforce ownership/admin permissions for the target object.
- Parse shared Zod schemas on the server. Preserve the existing caller contract:
  some actions return string errors, others return Zod issues and success data.
- Use `getTranslations()` for translated errors and update the affected path or
  client query cache after success. Do not require one cache strategy everywhere.
- The configured Next action body limit is `50mb`; it does not replace validation
  of file size, media type or ownership.
