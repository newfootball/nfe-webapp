# Identity import API

`runImport` defaults to the original credential-only, case-preserving policy.
For the authorized business migration, opt in with `preservePasswordless: true`
and `normalizeEmails: true`. Missing credentials then create users without a
password; malformed or ambiguous credentials remain deferred. Email addresses
are lowercased for target lookup, creation and ownership checks; the caller must
retain original addresses in its protected provenance. Case-insensitive source
and target collisions remain rejected. Both options bind the checkpoint; changing
one requires a new checkpoint and cannot adopt existing users.

`admins` must be an explicitly authorized list of source administrator IDs. The
import does not send recovery email. Google identities require a separate private
registry generated from the authorized provider projection; unknown subjects stay
denied. Checkpoint, source, policy and reports must remain private.

`targetConfig(endpoint, project, { isolatedBusinessImport: true })` and the same
fourth `AppwriteTarget` constructor argument allow only loopback HTTP `/v1` with
a port and project names matching `nfe-import-63-*`; the default still accepts
only `nfe-identity-*`. Neither mode permits remote targets. The CLI equivalents
are `--preserve-passwordless`, `--normalize-emails` and
`--isolated-business-import`. Online runs require the existing environment
configuration and an explicit protected administrator policy where applicable.
