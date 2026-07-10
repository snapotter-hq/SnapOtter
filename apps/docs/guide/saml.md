---
description: Set up SAML 2.0 Single Sign-On for SnapOtter. Step-by-step guides for Okta, Azure AD / Entra ID, Google Workspace, and other SAML identity providers.
---

# SAML SSO {#saml-sso}

SnapOtter supports SAML 2.0 for single sign-on. Users can log in via an external identity provider (Okta, Azure AD / Entra ID, Google Workspace, or any standard SAML 2.0 IdP) instead of local username/password authentication.

::: tip Enterprise feature
SAML SSO requires a **team** or **enterprise** license with the `saml_sso` feature. If `SAML_ENABLED=true` is set without a valid license, the SAML routes are silently skipped and a warning is logged.
:::

## Prerequisites {#prerequisites}

- A running SnapOtter instance reachable at a public URL
- `EXTERNAL_URL` set to that public URL (e.g. `https://photos.example.com`)
- A team or enterprise license key with the `saml_sso` feature
- Admin access to your SAML identity provider

## Quick start {#quick-start}

Add these environment variables to your `docker-compose.yml`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      SNAPOTTER_LICENSE_KEY: "your-license-key"
      SAML_ENABLED: "true"
      SAML_IDP_SSO_URL: "https://idp.example.com/sso/saml"
      SAML_IDP_CERTIFICATE: |
        MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw
        ...your IdP's signing certificate in PEM format...
        EAYHKoZIzj0CAQYFK4EEACIDYgAE
```

Restart the container. A "Sign in with SAML" button (or the label set by `SAML_PROVIDER_NAME`) appears on the login page.

## Configuration reference {#configuration-reference}

| Variable | Default | Description |
|---|---|---|
| `SAML_ENABLED` | `false` | Enable SAML login. |
| `SAML_IDP_SSO_URL` | | IdP's SSO endpoint URL. **Required** when SAML is enabled. |
| `SAML_IDP_CERTIFICATE` | | IdP's X.509 signing certificate in PEM format (the certificate text itself, not a file path). **Required** when SAML is enabled. |
| `EXTERNAL_URL` | | The public URL where SnapOtter is reachable. **Required** when SAML is enabled. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI sent to the IdP. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | Assertion Consumer Service (ACS) URL. |
| `SAML_AUTO_CREATE_USERS` | `true` | Automatically create a local user account on first SAML login. |
| `SAML_AUTO_LINK_USERS` | `false` | Link a SAML identity to an existing local user if the email address matches. |
| `SAML_DEFAULT_ROLE` | `user` | Role assigned to auto-created SAML users. One of `admin`, `editor`, or `user`. |
| `SAML_PROVIDER_NAME` | | Display label for the SAML login button on the frontend (e.g. "Okta", "Azure AD"). If empty, the button says "SAML". |
| `SAML_USERNAME_ATTRIBUTE` | | SAML assertion attribute used as the username. If empty, falls back to the email local-part, then NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | SAML assertion attribute used as the user's email address. |

The server refuses to start if `SAML_ENABLED=true` and any of the three required variables (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) are missing.

::: details Security notes
Both `wantAuthnResponseSigned` and `wantAssertionsSigned` are hardcoded to `true`. SnapOtter rejects unsigned or improperly signed SAML responses. Assertions from a trusted IdP are treated as email-verified.

Only SP-initiated login is supported. SnapOtter does not support IdP-initiated (unsolicited) login or Single Logout (SLO). Logging out of SnapOtter does not log the user out of the IdP.
:::

## SP metadata and URLs {#sp-metadata-and-urls}

Your IdP needs three values from SnapOtter:

| Field | Value |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

For example, if `EXTERNAL_URL` is `https://photos.example.com`:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Metadata endpoint: `https://photos.example.com/api/auth/saml/metadata` (returns XML)

Some IdPs can import the SP metadata URL directly, which auto-fills the ACS URL and Entity ID.

## Provider setup {#provider-setup}

### Okta {#okta}

1. In the Okta admin console, go to **Applications > Create App Integration**.
2. Select **SAML 2.0** and click **Next**.
3. Set a name (e.g. "SnapOtter") and click **Next**.
4. Configure the SAML settings:
   - **Single sign-on URL**: Your ACS URL (e.g. `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Your Entity ID (e.g. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. Under **Attribute Statements**, add `email` mapped to `user.email`.
6. Click **Next**, then **Finish**.
7. Go to the **Sign On** tab, click **View SAML setup instructions**, and copy:
   - **Identity Provider Single Sign-On URL** into `SAML_IDP_SSO_URL`
   - **X.509 Certificate** into `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. In the Azure portal, go to **Microsoft Entra ID > Enterprise applications > New application**.
2. Click **Create your own application**, name it "SnapOtter", and select **Integrate any other application you don't find in the gallery**.
3. Go to **Single sign-on > SAML** and click **Edit** on the **Basic SAML Configuration** section:
   - **Identifier (Entity ID)**: Your Entity ID (e.g. `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: Your ACS URL (e.g. `https://photos.example.com/api/auth/saml/callback`)
4. Under **SAML Certificates**, download the **Certificate (Base64)**.
5. Under **Set up SnapOtter**, copy the **Login URL**.
6. Set `SAML_IDP_SSO_URL` to the Login URL and `SAML_IDP_CERTIFICATE` to the downloaded certificate contents.
7. Assign users or groups to the application under **Users and groups**.

### Google Workspace {#google-workspace}

1. In the Google Admin console, go to **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Name the app "SnapOtter" and click **Continue**.
3. On the **Google Identity Provider details** page, copy the **SSO URL** and download the **Certificate**. Click **Continue**.
4. Configure the Service Provider details:
   - **ACS URL**: Your ACS URL (e.g. `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Your Entity ID (e.g. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Click **Continue**, then **Finish**.
6. Turn the app **ON** for your organizational units.
7. Set `SAML_IDP_SSO_URL` to the SSO URL from step 3 and `SAML_IDP_CERTIFICATE` to the downloaded certificate contents.

### Generic SAML 2.0 IdP {#generic-saml-2-0-idp}

For any SAML 2.0 compliant identity provider:

1. Create a new SAML application/service provider in your IdP.
2. Set the **ACS URL** to `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Set the **Entity ID** / **Audience** to `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Configure the IdP to send the user's email in an attribute named `email` (or set `SAML_EMAIL_ATTRIBUTE` to match your IdP's attribute name).
5. Copy the **IdP SSO URL** and **signing certificate** into `SAML_IDP_SSO_URL` and `SAML_IDP_CERTIFICATE`.

## User provisioning {#user-provisioning}

### Auto-create {#auto-create}

When `SAML_AUTO_CREATE_USERS` is `true` (the default), a local user account is created the first time someone logs in via SAML. The role is set to `SAML_DEFAULT_ROLE`.

The username is derived in this order:

1. The value of the assertion attribute specified by `SAML_USERNAME_ATTRIBUTE` (if set and present)
2. The local-part of the email address (everything before `@`)
3. The SAML NameID

If a username collision occurs, a numeric suffix is appended (e.g. `jane` becomes `jane_2`).

### Auto-link {#auto-link}

When `SAML_AUTO_LINK_USERS` is `true`, SnapOtter links a SAML identity to an existing local account if the email addresses match. This is useful when you have pre-created user accounts and want them to start using SSO without losing their data.

::: warning
Only enable auto-link if you trust your SAML IdP to verify email addresses. An unverified email from a misconfigured IdP could allow someone to take over another user's account.
:::

### Attribute mapping {#attribute-mapping}

| SnapOtter field | Source | Configuration |
|---|---|---|
| Email | Assertion attribute | `SAML_EMAIL_ATTRIBUTE` (default: `email`) |
| Username | Assertion attribute, email, or NameID | `SAML_USERNAME_ATTRIBUTE` (see derivation order above) |
| External ID | NameID | Always the SAML NameID, not configurable |

## SSO enforcement {#sso-enforcement}

If you want to require all users to log in via SAML (or OIDC) and block local password login, enable SSO enforcement:

1. Ensure the `sso_enforcement` enterprise feature is licensed (available on team and enterprise plans).
2. In **Admin Settings > Security**, toggle **SSO Enforcement** on.
3. Set a **break-glass username**: this is the one local account that can still log in with a password, for emergency access if the IdP is unreachable.

When SSO enforcement is active, any local login attempt (except for the break-glass user) returns a 403 error with the message "Local password login is disabled. Please use SSO."

::: tip
Always configure a break-glass username before enabling SSO enforcement. Without it, you could be locked out of SnapOtter if your IdP goes down.
:::

## Using SAML alongside OIDC {#using-saml-alongside-oidc}

SAML and OIDC can be enabled simultaneously. When both are active, the login page shows separate buttons for each provider (labeled by `SAML_PROVIDER_NAME` and `OIDC_PROVIDER_NAME`). Users can log in with either method.

Both providers share the same auto-create, auto-link, and SSO enforcement settings independently: each has its own `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS`, and `*_DEFAULT_ROLE` variables.

## Troubleshooting {#troubleshooting}

### Assertion validation failed {#assertion-validation-failed}

The SAML response signature or assertion signature could not be verified. Check:

- The certificate in `SAML_IDP_CERTIFICATE` matches the current signing certificate in your IdP (certificates rotate, so check for expiry)
- The certificate is in PEM format (begins with `-----BEGIN CERTIFICATE-----`)
- The certificate is the full text, not a file path
- The ACS URL and Entity ID configured in your IdP match SnapOtter's values exactly (scheme, host, port, path)

### Missing attributes {#missing-attributes}

If usernames or emails are empty after login, your IdP may not be sending the expected attributes. Check:

- Your IdP is configured to release an `email` attribute (or whatever `SAML_EMAIL_ATTRIBUTE` is set to)
- If using `SAML_USERNAME_ATTRIBUTE`, verify that attribute is included in the assertion
- Some IdPs require explicit attribute mapping configuration before they release claims

### Clock skew {#clock-skew}

SAML assertions include timestamp conditions (`NotBefore`, `NotOnOrAfter`). If your server clock and the IdP clock are out of sync, assertion validation fails. Run NTP on both machines to keep clocks aligned.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

This warning appears in the server logs when `SAML_ENABLED=true` but the license does not include the `saml_sso` feature. Verify your license key and plan. The `saml_sso` feature is available on team and enterprise plans.

### Login redirects back with error {#login-redirects-back-with-error}

If clicking the SAML login button redirects back to the login page with an error, check the server logs for details. Common causes:

- The IdP SSO URL is unreachable from the server
- The IdP rejected the authentication request (check the IdP's audit logs)
- The IdP returned an unsigned response (SnapOtter requires both the response and assertion to be signed)
