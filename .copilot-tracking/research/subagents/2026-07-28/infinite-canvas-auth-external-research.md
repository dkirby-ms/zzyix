---
title: Infinite Canvas External Authentication Research
description: Evidence-based evaluation of identity providers and authentication architecture for the zzyix SPA, API, and Socket.IO deployment
author: GitHub Copilot
ms.date: 2026-07-28
ms.topic: concept
keywords:
  - authentication
  - authorization
  - Microsoft Entra
  - OpenID Connect
  - Socket.IO
  - Azure Container Apps
---

## Research status

Status: Complete

## Research scope

The research answers these questions for the zzyix browser SPA and
TypeScript, Express, and Socket.IO server deployed as separate Azure
Container Apps:

1. Which identity audience best fits the product: Microsoft Entra workforce,
   Microsoft Entra External ID, or a provider-neutral alternative?
2. How should the SPA use authorization code with PKCE, and how should the
   Node API validate access tokens, issuers, audiences, signing keys, scopes,
   and application-domain authorization?
3. Which authentication transport best fits separate-origin REST and
   Socket.IO traffic: bearer tokens, a same-site BFF cookie session, or Azure
   Container Apps managed authentication?
4. Which maintained Node and browser libraries have current, exact
   recommendations from authoritative documentation?
5. How should external identities map to immutable internal principals and a
   safe client-visible profile?
6. How can local development and end-to-end tests exercise authentication
   without weakening production controls?
7. Which configuration and secrets are required, and how should rollout and
   failure behavior work?

## Repository context

The current system has application authorization concepts but no trustworthy
authentication boundary.

* `apps/server/src/contracts.ts` defines `ConnectionAuth` as `sessionId`,
   `clientId`, and protocol flags. `SocketData` has an optional `principalId`, but
   no token or authenticated identity is present in the public handshake contract.
* `apps/server/src/index.ts` accepts the handshake identity from
   `socket.handshake.auth`, applies an IP-based connection rate limit, and sets
   protocol-v2 `principalId` from the client-controlled `clientId`. A caller can
   therefore impersonate another principal if authorization starts relying on
   that value without first adding token validation.
* REST routes such as `GET /sessions` and `POST /sessions` are unauthenticated.
   The custom CORS middleware permits configured origins and credentials, but its
   allow-list does not yet include `Authorization`.
* `apps/server/src/db/schema.ts` already contains an appropriate identity seam:
   immutable UUID `principals`, plus `external_principal_mappings` keyed by the
   composite `(provider_namespace, external_subject)`. Patches refer to internal
   principals through `owner_principal_id`; memberships carry roles; patch
   operations preserve `actor_principal_id` for audit attribution.
* `apps/server/src/db/repository.ts` can resolve a delivery principal from either
   an internal `principalId` or an external mapping tuple. Patch access is based
   on owner or membership relationships, not display names.
* The legacy `users.client_id`, participants, operation log, tile attribution,
   and idempotency records still use caller-facing text IDs. Authentication
   rollout must distinguish ephemeral device or connection IDs from immutable
   principals and preserve compatibility during migration.
* The client and Playwright tests construct Socket.IO `auth` with generated
   `clientId` values and issue REST calls without bearer tokens. The E2E harness
   already has a test-only reset control gated by `NODE_ENV=test`,
   `E2E_TEST_MODE`, and a reset token. This is a useful precedent for strict
   environment-gated test authentication.
* `infra/bicep` deploys the SPA and API as separate Azure Container Apps with
   external ingress. The browser receives the API FQDN, while the server receives
   an explicit client-origin CORS value. The API supports multiple replicas and
   the Socket.IO PostgreSQL adapter, so authentication state cannot depend on
   process-local memory unless sticky sessions or a shared session store is added.
* GitHub issue [#14](https://github.com/dkirby-ms/zzyix/issues/14), open as of
   2026-07-28, requires authentication on protected endpoints and channels,
   owner/editor/viewer enforcement, safe failures, and token or session handling.
   Issue [#5](https://github.com/dkirby-ms/zzyix/issues/5) still leaves the
   production security baseline and NFR sign-off open. Issue
   [#20](https://github.com/dkirby-ms/zzyix/issues/20) requires real
   multi-instance reconnect and fan-out validation, which authentication tests
   must preserve.

The local schema supports external identity correctly, but the live protocol
does not yet establish one. The authentication architecture should resolve a
verified token to the existing composite mapping and set `socket.data.principalId`
server-side before any room authorization or mutation handler runs.

## Authoritative findings

### Protocol and token validation

* A browser SPA is an OAuth public client. It must use authorization code with
   PKCE, a fresh high-entropy verifier for every authorization request, and the
   `S256` challenge method. It must not contain a client secret. RFC 9700 makes
   PKCE mandatory for public clients, and RFC 7636 defines a verifier as 43 to
   128 unreserved characters with at least 256 bits of entropy recommended.
* The authorization server and SPA redirect URI must be exact allow-listed
   values. For Microsoft Entra, the redirect URI must be registered as type
   `spa`. Resource owner password credentials and implicit flow are not suitable.
* The SPA requests an access token for the zzyix API audience. The API, not the
   SPA, is responsible for accepting it. The API must validate the signature,
   an explicit algorithm allow-list, exact trusted issuer, zzyix API audience,
   expiry and not-before times, and the required delegated scope. It must reject
   a malformed or invalid token with `401` and an authenticated caller without
   sufficient scope or patch access with `403`.
* Signing keys come from the issuer's OIDC discovery metadata and `jwks_uri`.
   The verifier must cache keys, support multiple simultaneous keys, and refresh
   metadata or JWKS on an unknown `kid` so planned rotation does not require an
   API deployment. It must never choose an issuer or JWKS URL from an unverified
   token claim.
* OAuth scopes answer whether a client was delegated access to the API. They do
   not answer whether a principal owns or may edit a specific patch. A small API
   scope such as `quilt.access` should gate the application boundary; PostgreSQL
   owner, membership, role, visibility, lifecycle, and moderation state should
   continue to decide each domain operation.
* Access tokens are bearer credentials and should be short-lived, sent only
   over HTTPS, kept out of URLs and logs, and contain no sensitive profile data.
   Provider revocation normally prevents future token issuance but does not
   retroactively invalidate every access token. Microsoft documents a typical
   one-hour Entra access-token lifetime. Immediate zzyix deactivation therefore
   requires a local principal status or deny-list check in addition to IdP
   revocation.

### Identity audiences and providers

| Alternative | Benefits | Limitations | Best fit | Project alignment | Complexity |
|---|---|---|---|---|---|
| Microsoft Entra workforce tenant | Mature enterprise controls, Conditional Access, organization-managed lifecycle, Microsoft-supported MSAL browser libraries | Tenant membership and guest invitation are poor defaults for an open community; B2B guests remain workforce collaboration identities | Employees, contractors, or invited partner organizations | Strong only if zzyix is organization-restricted | Medium |
| Microsoft Entra External ID external tenant | Separate CIAM directory, self-service sign-up/sign-in, branding, custom attributes, password or one-time passcode, social and custom OIDC federation, customer account administration | A separate tenant and customer flow configuration add operations; product capabilities and licensing must be confirmed in the target subscription | Public consumers or community members | Strongest Microsoft-native match for the apparent product audience | Medium |
| Auth0 | Provider-neutral OIDC/OAuth service, maintained `@auth0/auth0-react` SDK, documented React/Vite and protected-API flows, broad social/enterprise federation | Another vendor, tenant, billing model, and operational console; migration still requires preserving immutable issuer/subject mappings | Teams prioritizing provider portability and CIAM ergonomics over Azure consolidation | Technically strong fallback; weaker Azure operational consolidation | Medium |

Azure AD B2C should not be selected for new work. Microsoft states that it is
legacy and unavailable for purchase by new customers after 2025-05-01; Entra
External ID is the current Microsoft CIAM direction.

The provider choice is primarily an audience decision, not a protocol decision.
The API should isolate provider-specific configuration behind a trusted-issuer
registry so workforce Entra, External ID, or Auth0 produces the same verified
identity shape. Do not permit arbitrary issuers merely because they publish
valid OIDC metadata.

### Maintained package choices

* For a Microsoft provider, use `@azure/msal-browser` and optionally the
   `@azure/msal-react` wrapper. Current MSAL browser implements authorization
   code with PKCE and explicitly does not implement implicit flow. MSAL React v5
   is under active development and supports React 19. Let MSAL acquire and renew
   tokens; do not implement authorization redirects or refresh-token storage by
   hand.
* For Auth0, use `@auth0/auth0-react`. Its current React quickstart configures a
   SPA with callback, logout, and web-origin allow lists, requests an API
   audience, and obtains tokens with `getAccessTokenSilently` for bearer API
   calls.
* For the Node API, use the provider-neutral `jose` package. Its current v6 line
   is actively maintained, ESM-native, has no dependencies, supports Node, and
   exposes `createRemoteJWKSet` plus `jwtVerify` for signature and claims-set
   validation. Wrap it in a small trusted-issuer verifier that pins issuer,
   audience, accepted asymmetric algorithms, and required scope. This avoids
   coupling application authorization to a provider SDK while retaining OIDC
   interoperability.
* A fetched GitHub URL for an Auth0 Express bearer middleware returned `404`, so
   this research does not recommend that package by name. The documented and
   maintained `jose` primitive is sufficient and easier to use consistently for
   Entra, Auth0, and a local test issuer.

### Socket.IO and scaled deployment

Socket.IO namespace middleware runs once per connection and can reject a
connection before handlers run. The browser can provide a current credential in
the client's `auth` object, including through an auth callback, and the server
reads it from `socket.handshake.auth`. On `connect_error`, a client can acquire a
new token, update `socket.auth`, and explicitly reconnect.

Browser WebSocket connections cannot reliably add an arbitrary `Authorization`
header; Socket.IO documents that `extraHeaders` is ignored for browser
WebSocket-only connections. Therefore, use `Authorization: Bearer` for REST and
`auth: { token }` for Socket.IO. Authenticate every new or reconnected transport
and store only the resolved internal principal ID in `socket.data`.

CORS controls browser HTTP reads, not identity. It applies to Socket.IO polling
but not to WebSocket itself. Keep an explicit client-origin allow list regardless
of transport, but rely on token validation for access control. With multiple
Socket.IO replicas, the PostgreSQL adapter forwards events but does not share
polling transport state. Polling still needs ingress affinity; WebSocket-only
avoids that need but gives up polling fallback. Authentication must be stateless
per connection or backed by a shared store.

## Architecture alternatives

| Transport | Token exposure and browser threats | Refresh and reconnect | CSRF and CORS | Horizontal scaling | Operations and fit |
|---|---|---|---|---|---|
| SPA bearer: REST `Authorization`, Socket.IO `auth.token` | JavaScript must obtain the token, so successful XSS can steal or use it. Prefer SDK-managed memory/session caching, strict CSP, dependency hygiene, no token logging, and short lifetimes. Avoid `localStorage` unless the accepted persistence threat explicitly justifies it. | The SDK silently acquires a current token before REST calls and Socket.IO connections. On authentication failure, acquire once and reconnect; if interaction is required, stop retrying and prompt sign-in. | Bearer headers are not ambient credentials, reducing classic CSRF. REST preflight must allow `Authorization`; Socket.IO still needs an explicit origin policy. | Stateless verification fits all API replicas and the existing PostgreSQL adapter. No shared auth session store is needed. | Lowest change and operational complexity for the existing separate SPA/API deployment. Recommended first architecture. |
| BFF with secure cookie session | Access and refresh tokens remain server-side, reducing token exfiltration from browser JavaScript. XSS can still perform authenticated actions. Session fixation and theft remain relevant. | The BFF refreshes upstream tokens and the browser reconnects with its cookie. Revocation and expiry require a shared session record. | Ambient cookies require `Secure`, `HttpOnly`, an appropriate `SameSite` value, strict origin checks, and CSRF tokens for state-changing HTTP requests. Cross-origin cookie behavior and browser privacy rules complicate separate client/API hosts. | Requires a shared distributed session store and coherent cookie domain. Socket.IO polling may also require affinity. | Best when client and BFF can share one site and the team accepts more infrastructure. Consider later if browser-held bearer risk is unacceptable. |
| Azure Container Apps built-in authentication | Tokens are handled by the platform sidecar and identity headers are injected after authentication. The application must trust headers only from that boundary. | Server-directed flow establishes an ACA cookie; client-directed flow returns an ACA token submitted through `X-ZUMO-AUTH`. | Cookie mode inherits CSRF and cross-origin constraints. Global unauthenticated-request rejection can also block a public SPA shell. | The sidecar runs on every replica, but each Container App issues its own cookie/token by default. Separate SPA and API apps do not automatically form one session boundary. | Useful for simple single-app protection or an internal portal. It does not remove zzyix domain authorization and is awkward for the present two-app topology and Socket.IO bearer contract. Not recommended as the primary design. |

The BFF is a valid higher-assurance option, but it is not a drop-in use of the
existing server. A defensible BFF design would place the browser and BFF under
one site, proxy all API and Socket.IO traffic through that origin, store sessions
outside the replicas, and implement CSRF controls. Without that topology change,
the bearer design is simpler and less error-prone.

## Recommended architecture

Assuming zzyix is intended for public or self-service community users, select a
Microsoft Entra External ID external tenant and use a SPA bearer architecture.
If the audience is exclusively employees and invited organizational partners,
use a workforce tenant instead. Auth0 is the recommended neutral alternative
when provider portability, non-Microsoft federation, or CIAM administration
outweighs Azure consolidation.

1. Register the SPA as a public client and the API as a separate resource.
    Configure exact production and local redirect/logout origins and one minimal
    delegated API scope. Use authorization code with PKCE/S256.
2. Acquire a zzyix API access token through the provider SDK immediately before
    a protected REST call or Socket.IO connection. Do not send an ID token to the
    API and do not expose refresh tokens to application code.
3. Send the access token in REST `Authorization: Bearer` and Socket.IO
    `auth.token`. Keep `sessionId` and protocol negotiation fields, but treat a
    legacy `clientId` only as a non-authoritative device/connection identifier.
4. Run the same verifier before protected Express handlers and in `io.use()`.
    Pin trusted issuer, JWKS URI derived from trusted discovery, API audience,
    asymmetric algorithm, expiry, and scope. Resolve the verified external
    identity to `principals.id`, then populate server-owned request context or
    `socket.data.principalId`.
5. Keep every owner/editor/viewer and lifecycle decision in the existing domain
    authorization layer. Recheck authorization for each mutation; room admission
    is not durable permission.
6. Return only safe profile data from an authenticated `/me` endpoint. Never
    accept `principalId`, role, owner ID, email, or display name as caller
    authority.

```text
Browser SPA -- code + PKCE --> trusted identity provider
Browser SPA <-- API access token -- trusted identity provider
Browser SPA -- REST Authorization / Socket.IO auth.token --> API replica
API replica -- discovery + cached JWKS --> trusted issuer
API replica -- verified (issuer, subject) --> external_principal_mappings
API replica -- internal principal ID --> patch authorization and audit
```

## Principal mapping and client profile

Use the normalized, exact issuer identifier plus the token's immutable `sub` as
the external key. The present schema's `(provider_namespace, external_subject)`
can represent this if `provider_namespace` is defined as a canonical trusted
issuer configuration ID or exact normalized issuer. A bare `sub` is unsafe
because OIDC guarantees uniqueness only within an issuer.

For a single Entra tenant, Microsoft also documents immutable tenant/object
identifiers (`tid`, `oid`) for application data. Prefer the protocol-general
`(iss, sub)` external mapping and retain verified `tid`/`oid` as optional provider
metadata when needed for administration. Never key authorization by email,
`preferred_username`, UPN, display name, or avatar URL; those are mutable and may
be reassigned.

Provision the mapping transactionally on first authenticated use, producing one
immutable internal UUID. Linking a second provider identity must require recent
authentication to both identities or an administrator-reviewed recovery path;
matching email alone must never merge accounts.

The safe client profile should contain only the internal public principal ID,
display name, avatar URL after URL/content policy validation, and product-level
capabilities needed by the UI. It should omit issuer subject, tenant/object IDs,
raw token claims, scopes, provider access tokens, email unless the feature needs
it, and authoritative patch roles. The server returns resource-specific
capabilities separately and remains authoritative.

Account deletion is two coordinated operations. Disable the local principal
first so already-issued tokens fail immediately, remove or anonymize personal
profile and external mappings according to retention policy, and preserve only
the minimum pseudonymous audit and content attribution required by policy. Then
delete or disable the IdP account and revoke provider sessions. External ID
supports deletion and a 30-day restoration window; Auth0 deletion is documented
as permanent. Provider deletion alone is insufficient because existing zzyix
data and still-valid access tokens have independent lifetimes.

## Local development and end-to-end testing

Local development and E2E should exercise the production validation path, not a
header or `clientId` bypass.

* Run a local test OIDC issuer or a deterministic test authorization service
   reachable only in the test network. Give it a distinct issuer, API audience,
   signing key, short token lifetime, and JWKS endpoint. Add that issuer to the
   verifier only when `NODE_ENV=test` and `E2E_TEST_MODE` are both asserted.
* Use `jose` in the test issuer or fixture service to sign standards-conforming
   tokens. The application server still runs normal signature, issuer, audience,
   expiry, and scope validation and normal external-principal mapping.
* Seed separate users for owner, editor, viewer, uninvited user, disabled user,
   and same-`sub`/different-issuer cases. Test expired tokens, wrong audience,
   wrong issuer, missing scope, unknown `kid`, malformed tokens, reconnect after
   expiry, cross-origin rejection, replica changes, and provider/JWKS outage.
* Browser E2E may either automate the local issuer's authorization-code/PKCE UI
   or obtain a token through a test-only standards endpoint. Direct token minting
   is acceptable for lower-level API/Socket.IO tests, but at least one browser
   path must test redirect, callback, renewal, and logout.
* Generate test keys per test environment and never deploy them or the test
   issuer allow-list to production. Do not expose a production route that trades
   `clientId`, email, or a reset secret for a principal.

For hosted-IdP integration tests, create ephemeral test users and delete them
after the run. Auth0 specifically warns that automated tests accumulate refresh
tokens and recommends deleting test users and associated artifacts. Keep hosted
tests as a smaller scheduled suite; use the local issuer for deterministic pull
request coverage.

## Configuration, rollout, and failure behavior

### Configuration and secrets

| Component | Public configuration | Secret or protected configuration |
|---|---|---|
| SPA | Authority/issuer, SPA client ID, API audience/scope, redirect URI, logout URI, API origin | None; a SPA client secret is invalid architecture |
| API | Trusted issuer IDs, API audience, accepted algorithms, required scopes, allowed client origins, discovery/JWKS cache policy | No signing secret for asymmetric external tokens; database credentials and any provider management API credential remain secret |
| BFF, only if selected | Cookie name and public origin | OIDC client secret or private key, cookie/session encryption keys, distributed session-store credential |
| E2E | Test issuer, test audience, test client ID | Test signing private key and any hosted test-user management credential |

Use managed identity and Key Vault references for server-side provider-management
credentials where feasible. Rotate BFF secrets, session keys, and management API
credentials with overlap. Issuer signing-key rotation should be automatic through
JWKS and should not be represented as a zzyix secret.

### Rollout

1. Add the shared token verifier, authenticated request/socket context, external
    mapping resolution, and negative validation tests without changing domain
    semantics.
2. Introduce an authenticated `/me` route and protected v2 REST/Socket.IO paths.
    Add `Authorization` to the precise REST CORS allow-list. Never echo tokens.
3. Update the SPA to acquire tokens and reconnect Socket.IO with a fresh token.
    Continue carrying legacy `clientId` only where protocol compatibility needs
    an ephemeral connection ID.
4. Backfill or explicitly claim legacy content into internal principals. Require
    proof or administrator review; do not infer ownership from a matching display
    name or email.
5. Run authenticated E2E against at least two API replicas, then make protected
    routes mandatory and remove the identity meaning of `clientId`.
6. Add operational alerts for validation failures by reason without recording
    tokens or subjects, JWKS refresh failures, login errors, reconnect loops,
    authorization denials, and external-mapping conflicts.

### Failure behavior

* Expired, malformed, wrong-issuer, wrong-audience, wrong-algorithm, missing-key,
   or insufficient-scope tokens fail closed. Socket.IO rejects the connection
   with a stable machine-readable authentication code; REST uses `401` or `403`.
* Cache verified issuer metadata and JWKS with bounded lifetimes. During a brief
   IdP/JWKS outage, continue validating tokens whose signing key is already cached
   and whose claims remain valid. Do not extend token expiry. If an unknown `kid`
   cannot be refreshed, reject that token and alert rather than accepting an
   unverified key.
* Existing authenticated sockets do not automatically become safe forever.
   Set a maximum connection authentication age or disconnect at token expiry,
   then require a fresh token on reconnect. Check local principal status and
   resource authorization on every mutation so local deactivation is immediate.
* During a provider authorization outage, existing valid access tokens may work
   until expiry and cached-key limits; new sign-ins and renewals fail. The client
   should preserve unsent local work, stop exponential reconnect loops, report a
   temporary authentication outage, and require interaction when the SDK says it
   is necessary.

## Source register

Sources were reviewed on 2026-07-28 unless a source date is stated.

* [OAuth 2.0 Security Best Current Practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700)
* [Proof Key for Code Exchange, RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)
* [JWT Best Current Practices, RFC 8725](https://www.rfc-editor.org/rfc/rfc8725)
* [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
* [Microsoft identity platform authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
* [Microsoft identity platform access tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)
* [Microsoft identity platform claims validation](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation)
* [Microsoft Entra External ID customer overview](https://learn.microsoft.com/en-us/entra/external-id/customers/overview-customers-ciam)
* [Microsoft Entra external identities overview](https://learn.microsoft.com/en-us/entra/external-id/external-identities-overview)
* [Manage External ID customer accounts](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-manage-customer-accounts), source dated 2025-03-10 and updated 2026-02-06
* [Revoke Microsoft Entra user access](https://learn.microsoft.com/en-us/entra/identity/users/users-revoke-access), source dated 2026-06-19
* [Azure Container Apps authentication](https://learn.microsoft.com/en-us/azure/container-apps/authentication)
* [Azure Container Apps Entra authentication](https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra)
* [Socket.IO middleware](https://socket.io/docs/v4/middlewares/), [client options](https://socket.io/docs/v4/client-options/), [CORS](https://socket.io/docs/v4/handling-cors/), and [multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/), pages updated 2026-06-09
* [`@azure/msal-browser`](https://github.com/AzureAD/microsoft-authentication-library-for-js/tree/dev/lib/msal-browser) and [`@azure/msal-react`](https://github.com/AzureAD/microsoft-authentication-library-for-js/tree/dev/lib/msal-react), active repositories reviewed 2026-07-28
* [`jose`](https://github.com/panva/jose), v6.2.4 current during review and released in the preceding week
* [Auth0 React SPA quickstart](https://auth0.com/docs/quickstart/spa/react), [access-token validation](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens), [token practices](https://auth0.com/docs/secure/tokens/token-best-practices), and [user deletion](https://auth0.com/docs/manage-users/user-accounts/delete-users)

## Follow-on questions

* Validate Entra External ID feature availability, pricing, custom-domain needs,
   and social identity providers in the intended Azure subscription before
   implementation.
* Prototype third-party-cookie and renewal behavior in the target browsers and
   decide whether in-memory or session-backed SDK caching gives the acceptable
   persistence/security tradeoff.
* Define product policy for content and audit retention after account deletion,
   ownership transfer, account recovery, and provider linking.
* Confirm Container Apps ingress affinity behavior for Socket.IO polling, or
   explicitly test and approve WebSocket-only transport.

## Clarifying decisions

The only blocking product decision is the identity audience:

* Select **Entra External ID** for public or self-service community access.
* Select **Entra workforce** only for organization-controlled employees and
   invited partners.
* Select **Auth0** when provider neutrality or its CIAM operations justify an
   additional vendor.

The bearer transport recommendation does not depend on that choice. A BFF should
replace it only after an explicit security decision that browser token exposure
outweighs the topology, shared-session, CSRF, and operational costs.