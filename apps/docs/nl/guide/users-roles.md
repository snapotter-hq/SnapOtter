---
description: "Beheer gebruikers, ingebouwde en aangepaste rollen, permissies, API-sleutels, teams, sessies en het auditlogboek in SnapOtter."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: ddd4d1d21c1b
---

# Gebruikers, rollen en permissies {#users-roles-permissions}

SnapOtter wordt geleverd met drie ingebouwde rollen, 17 granulaire permissies en ondersteuning voor aangepaste rollen met optionele toegangscontrole per tool. Deze pagina behandelt het volledige autorisatiemodel, scoping van API-sleutels, teambeheer en auditlogging.

::: tip Gerelateerde pagina's
[OIDC / SSO](/nl/guide/oidc) | [SAML SSO](/nl/guide/saml) | [SCIM-provisioning](/nl/guide/scim) | [Beveiliging en hardening](/nl/guide/security)
:::

## Gebruikers {#users}

### Gebruikers aanmaken {#creating-users}

Beheerders kunnen gebruikers aanmaken via het beheerderspaneel of het `POST /api/auth/register`-endpoint. Elke gebruiker heeft een gebruikersnaam, rol, teamtoewijzing en een optioneel e-mailadres.

### Standaardbeheerder {#default-admin}

Bij de eerste start maakt SnapOtter een standaardbeheerdersaccount aan. De inloggegevens komen uit omgevingsvariabelen:

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | Gebruikersnaam voor het initiële beheerdersaccount |
| `DEFAULT_PASSWORD` | `admin` | Wachtwoord voor het initiële beheerdersaccount |

De standaardbeheerder moet zijn wachtwoord wijzigen bij de eerste aanmelding.

### Authenticatieproviders {#authentication-providers}

Gebruikers kunnen zich authenticeren via verschillende methoden:

- **Lokaal** - gebruikersnaam en wachtwoord opgeslagen in de SnapOtter-database
- **OIDC** - elke OpenID Connect-provider (zie [OIDC / SSO](/nl/guide/oidc))
- **SAML** - SAML 2.0 identity providers (zie [SAML SSO](/nl/guide/saml))
- **SCIM** - geautomatiseerde provisioning vanuit een identity provider (zie [SCIM-provisioning](/nl/guide/scim))

### Authenticatie uitschakelen {#disabling-authentication}

Stel `AUTH_ENABLED=false` in om authenticatie volledig uit te schakelen. In deze modus wordt een synthetische anonieme gebruiker met de rol `admin` gebruikt voor alle verzoeken. Er is geen aanmelding vereist.

::: warning 
Het uitschakelen van authenticatie geeft volledige beheerderstoegang aan iedereen die de instantie kan bereiken. Gebruik dit alleen in vertrouwde omgevingen.
:::

## Ingebouwde rollen {#built-in-roles}

SnapOtter bevat drie ingebouwde rollen. Ze kunnen niet worden gewijzigd of verwijderd.

### Admin {#admin}

Alle 17 permissies. Volledige controle over de instantie.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 permissies. Kan alle tools gebruiken en alle bestanden en pipelines beheren, maar heeft geen toegang tot beheerdersfuncties.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 permissies. Kan tools gebruiken en eigen resources beheren.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Permissiereferentie {#permissions-reference}

| Permissie | Beschrijving |
|---|---|
| `tools:use` | Elke verwerkingstool gebruiken |
| `files:own` | Eigen bestanden bekijken en beheren |
| `files:all` | Bestanden van alle gebruikers bekijken en beheren |
| `apikeys:own` | Eigen API-sleutels aanmaken en beheren |
| `apikeys:all` | API-sleutels van alle gebruikers bekijken |
| `pipelines:own` | Eigen pipelines aanmaken en beheren |
| `pipelines:all` | Pipelines van alle gebruikers bekijken en beheren |
| `settings:read` | Instantie-instellingen bekijken |
| `settings:write` | Instantie-instellingen wijzigen |
| `users:manage` | Gebruikersaccounts aanmaken, bijwerken en verwijderen |
| `teams:manage` | Teams aanmaken, bijwerken en verwijderen |
| `features:manage` | AI-featurebundels installeren en beheren |
| `system:health` | Toegang tot health- en readiness-endpoints |
| `audit:read` | Het auditlogboek bekijken en rollen weergeven |
| `compliance:manage` | GDPR-lifecycle en compliancefuncties beheren |
| `webhooks:manage` | Uitgaande webhooks configureren |
| `security:manage` | Beveiligingsinstellingen beheren (IP-allowlist, SSO-afdwinging) |

## Aangepaste rollen {#custom-roles}

Beheerders met de permissie `security:manage` kunnen aangepaste rollen aanmaken via het beheerderspaneel of de rollen-API. Voor het weergeven van rollen is `audit:read` vereist.

### Een aangepaste rol aanmaken {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

Rolnamen moeten 2-30 tekens zijn, kleine letters, alfanumeriek met koppeltekens en underscores.

### Voor beheerders gereserveerde permissies {#admin-reserved-permissions}

Drie permissies zijn gereserveerd voor ingebouwde rollen en kunnen niet aan aangepaste rollen worden toegewezen:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

De rollen-API weigert elk verzoek dat deze permissies bevat. Alleen de ingebouwde rol `admin` heeft er toegang toe.

### Permissies op toolniveau {#tool-level-permissions}

Aangepaste rollen kunnen optioneel beperken tot welke tools gebruikers toegang hebben. Twee modi zijn beschikbaar:

| Modus | Gedrag | Licentievereiste |
|---|---|---|
| `category` | Beperken per modaliteit (image, video, audio, document, file) | Geen (gratis) |
| `tool` | Beperken per individuele tool-ID | Vereist de enterprise-feature `per_tool_permissions` |

Wanneer de modus `tool` is ingesteld maar de enterprise-feature niet beschikbaar is, degradeert SnapOtter netjes en staat het toegang tot alle tools toe.

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### Een aangepaste rol verwijderen {#deleting-a-custom-role}

Wanneer een aangepaste rol wordt verwijderd, worden alle daaraan toegewezen gebruikers automatisch opnieuw toegewezen aan de rol `user`.

## Teams {#teams}

Teams groeperen gebruikers voor opslag- en bewaarbeheer. Een `Default`-team wordt aangemaakt bij de eerste start.

| Veld | Type | Beschrijving |
|---|---|---|
| `name` | string | Unieke teamnaam (1-50 tekens) |
| `storageQuota` | number | Opslaglimiet per team in bytes (werkt zonder enterprise) |
| `retentionHours` | number | Uitvoer automatisch verwijderen na dit aantal uren (vereist `team_retention_overrides`, enterprise) |
| `legalHold` | boolean | Automatische verwijdering van bestanden van teamleden voorkomen (vereist `legal_hold`, enterprise) |

::: info 
Het `Default`-team kan niet worden verwijderd. Teams die nog leden hebben, kunnen niet worden verwijderd. Wijs de leden eerst opnieuw toe.
:::

## API-sleutels {#api-keys}

Gebruikers kunnen API-sleutels genereren voor programmatische toegang. Elke sleutel gebruikt het `si_`-voorvoegsel en wordt slechts één keer getoond bij het aanmaken.

### Gescopede permissies {#scoped-permissions}

API-sleutels kunnen optioneel een `permissions`-array dragen. Wanneer ingesteld, zijn de effectieve permissies voor een verzoek de **doorsnede** van de rolpermissies van de gebruiker en de gescopede permissies van de sleutel. Dit betekent dat een API-sleutel nooit verder kan escaleren dan de eigen permissies van de gebruiker.

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### Vervaldatum {#expiration}

Sleutels accepteren een optionele `expiresAt`-timestamp. Verlopen sleutels worden bij authenticatie geweigerd.

## Auditlogboek {#audit-log}

SnapOtter registreert beveiligingsrelevante gebeurtenissen in een gestructureerd auditlogboek dat is opgeslagen in de databasetabel `audit_log`.

### Het auditlogboek bekijken {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

Vereist de permissie `audit:read`. Ondersteunt paginering (`page`, `limit`) en filters (`action`, `ip`, `from`, `to`).

### Auditing van tooloperaties {#tool-operation-auditing}

::: warning 
`TOOL_EXECUTED`-gebeurtenissen worden standaard **niet** gelogd. Ze zijn opt-in via een van twee paden:

1. Stel de beheerdersinstelling `auditToolOperations` in op `true`.
2. Bezit een actieve licentie met de feature `audit_export` (beschikbaar op zowel team- als enterprise-plannen).

Zonder een van deze worden individuele tooluitvoeringen niet in het auditlogboek vastgelegd.
:::

### Exporteren {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

Vereist de permissie `audit:read` en de enterprise-feature `audit_export` (beschikbaar op zowel team- als enterprise-plannen). Ondersteunt CSV- en JSON-formaten, gefilterd op `action`, `actorId`, `targetType`, `targetId`, `from` en `to`.

### Sabotagebestendige ondertekening {#tamper-resistant-signing}

Wanneer ingeschakeld, wordt elke auditlogboekvermelding ondertekend met een HMAC afgeleid van `DATA_ENCRYPTION_KEY`. Dit vereist:

1. Het instellen van `DATA_ENCRYPTION_KEY` in je omgeving.
2. Het inschakelen van de beheerdersinstelling `tamperResistantAudit`.
3. Een enterprise-licentie met de feature `tamper_resistant_audit`.

### Bewaring {#retention}

Stel `AUDIT_RETENTION_DAYS` in om oude vermeldingen automatisch op te schonen. De standaard is `0`, wat betekent dat vermeldingen onbeperkt worden bewaard.

### Gebeurtenisreferentie {#event-reference}

| Gebeurtenis | Categorie |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Authenticatie |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Authenticatie |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Authenticatie |
| `LOGOUT` | Authenticatie |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | Gebruikersbeheer |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | Gebruikersbeheer |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Rollen |
| `API_KEY_CREATED`, `API_KEY_DELETED` | API-sleutels |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Instellingen |
| `FILE_UPLOADED`, `FILE_DELETED` | Bestanden |
| `TOOL_EXECUTED` | Tools (opt-in) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Compliance |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Compliance |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Configuratie |

## Sessiebeheer {#session-management}

Sessies zijn cookie-gebaseerd, geregeld door `SESSION_DURATION_HOURS` (standaard: 168 uur / 7 dagen).

### Rolwijzigingen maken sessies ongeldig {#role-changes-invalidate-sessions}

Wanneer een beheerder de rol van een gebruiker wijzigt, worden alle actieve sessies van die gebruiker verwijderd. De gebruiker moet opnieuw inloggen om de nieuwe permissies op te pikken.

### Veiligheidsmaatregelen {#safety-guards}

- **Bescherming van de laatste beheerder**: de laatst overgebleven beheerder kan niet worden gedegradeerd naar een lagere rol. De API retourneert een fout als je het probeert.
- **Voorkoming van zelfverwijdering**: beheerders kunnen hun eigen account niet via de API verwijderen.
