---
description: Set up Single Sign-On with OpenID Connect. Step-by-step guides for Keycloak, Authentik, Google, and other OIDC providers.
---

# OIDC / Single Sign-On {#oidc-single-sign-on}

SnapOtter supports OpenID Connect (OIDC) for single sign-on. Users can log in with an external identity provider such as Keycloak, Authentik, or Google instead of (or alongside) local username/password authentication.

::: tip See also
[SAML SSO](/guide/saml) | [SCIM Provisioning](/guide/scim) | [Users, Roles & Permissions](/guide/users-roles)
:::

## Quick start {#quick-start}

Add these environment variables to your `docker-compose.yml`:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

The redirect URI for your provider is always:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

For example, if `EXTERNAL_URL` is `https://photos.example.com`, configure your provider's redirect URI as `https://photos.example.com/api/auth/oidc/callback`.

## Configuration reference {#configuration-reference}

| Variable | Default | Description |
|---|---|---|
| `OIDC_ENABLED` | `false` | Enable OIDC login. A "Sign in with SSO" button appears on the login page. |
| `OIDC_ISSUER_URL` | | Provider's issuer URL. Must support OIDC Discovery (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | OAuth client ID registered with your provider. |
| `OIDC_CLIENT_SECRET` | | OAuth client secret. |
| `OIDC_SCOPES` | `openid profile email` | Space-separated list of scopes to request. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Automatically create a local user account on first OIDC login. |
| `OIDC_DEFAULT_ROLE` | `user` | Role assigned to auto-created OIDC users. One of `admin`, `editor`, or `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Link an OIDC identity to an existing local user if the email address matches. |
| `OIDC_PROVIDER_NAME` | | Display name shown on the login button (e.g. "Keycloak", "Google"). If empty, the button says "SSO". |
| `OIDC_CLOCK_TOLERANCE` | `30` | Clock skew tolerance in seconds for token validation. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | ID token claim used as the username for new accounts. |
| `EXTERNAL_URL` | | The public URL where SnapOtter is reachable. Required for OIDC to build the correct redirect URI. |
| `COOKIE_SECRET` | auto-generated | Secret for signing session cookies. Set this explicitly when running multiple replicas. |

## Provider guides {#provider-guides}

### Keycloak {#keycloak}

1. Create a new realm (or use an existing one).
2. Go to **Clients** and create a new client:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. Under the client's **Settings** tab, set **Valid redirect URIs** to your callback URL (e.g. `https://photos.example.com/api/auth/oidc/callback`).
4. Copy the **Client secret** from the **Credentials** tab.
5. Set `OIDC_ISSUER_URL` to `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. In the admin interface, go to **Applications > Providers** and create a new **OAuth2/OpenID Provider**.
   - **Client type**: Confidential
   - **Redirect URIs**: Your callback URL
   - **Signing key**: Select an existing key or create one
2. Create an **Application** and link it to the provider.
3. Copy the **Client ID** and **Client Secret** from the provider settings.
4. Set `OIDC_ISSUER_URL` to `https://authentik.example.com/application/o/snapotter/` (the trailing slash matters).

### Google {#google}

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or select an existing one).
3. Navigate to **APIs & Services > OAuth consent screen** and configure it.
4. Go to **APIs & Services > Credentials** and create an **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: Your callback URL
5. Copy the **Client ID** and **Client secret**.
6. Set `OIDC_ISSUER_URL` to `https://accounts.google.com`.
7. Set `OIDC_USERNAME_CLAIM` to `email` (Google does not provide `preferred_username`).

## User provisioning {#user-provisioning}

### Auto-create {#auto-create}

When `OIDC_AUTO_CREATE_USERS` is `true` (the default), a local user account is created the first time someone logs in via OIDC. The username is taken from the claim specified by `OIDC_USERNAME_CLAIM`, and the role is set to `OIDC_DEFAULT_ROLE`.

If a username collision occurs, a numeric suffix is appended (e.g. `jane` becomes `jane_2`).

### Auto-link {#auto-link}

When `OIDC_AUTO_LINK_USERS` is `true`, SnapOtter links an OIDC identity to an existing local account if the email addresses match. This is useful when you have pre-created user accounts and want them to start using SSO without losing their data.

::: warning
Only enable auto-link if you trust your OIDC provider to verify email addresses. An unverified email could allow someone to take over another user's account.
:::

### Disabling local login {#disabling-local-login}

OIDC does not disable local username/password login. Both methods remain available. Admins can still log in with local credentials if the OIDC provider is unreachable.

## Self-signed certificates {#self-signed-certificates}

If your OIDC provider uses a self-signed or private CA certificate, mount the CA bundle into the container and point `NODE_EXTRA_CA_CERTS` to it:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - ./my-ca.pem:/etc/ssl/certs/custom-ca.pem:ro
    environment:
      NODE_EXTRA_CA_CERTS: /etc/ssl/certs/custom-ca.pem
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.internal.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

::: danger
Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`. This disables all TLS verification and is a security risk.
:::

## Troubleshooting {#troubleshooting}

### Redirect URI mismatch {#redirect-uri-mismatch}

The most common error. Check for these differences between what your provider expects and what SnapOtter sends:

- `http` vs `https` - the scheme must match exactly
- Trailing slash - some providers are strict about this
- Port number - include the port if it is non-standard
- Path - must be `/api/auth/oidc/callback`

Double-check `EXTERNAL_URL`. It must match the URL users type in their browser.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

The OIDC provider is using a certificate that Node.js does not trust. See [Self-signed certificates](#self-signed-certificates) above.

### Clock skew errors {#clock-skew-errors}

If your server clock and the OIDC provider clock are out of sync, token validation may fail. Increase `OIDC_CLOCK_TOLERANCE` (default is 30 seconds). A better fix is to run NTP on both machines.

### "OIDC provider unreachable" {#oidc-provider-unreachable}

SnapOtter fetches the provider's discovery document at startup and during login. Check:

- DNS resolution from inside the Docker container (`docker exec snapotter nslookup auth.example.com`)
- Firewall rules between the container and the provider
- The `OIDC_ISSUER_URL` value - it must be reachable from the server, not just from your browser

### Missing claims {#missing-claims}

If usernames or emails are empty after login, your provider may not be returning the expected claims. Verify:

- The scopes configured in `OIDC_SCOPES` include `profile` and `email`
- The provider is configured to include the claim specified in `OIDC_USERNAME_CLAIM` in the ID token
- Some providers require explicit mapper/scope configuration to release claims
