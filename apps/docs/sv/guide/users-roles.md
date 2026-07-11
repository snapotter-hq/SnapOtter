---
description: "Hantera användare, inbyggda och anpassade roller, behörigheter, API-nycklar, team, sessioner och granskningsloggen i SnapOtter."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: ce4e3c6f3ee8
---

# Användare, roller och behörigheter {#users-roles-permissions}

SnapOtter levereras med tre inbyggda roller, 17 detaljerade behörigheter och stöd för anpassade roller med valfri åtkomstkontroll per verktyg. Den här sidan täcker hela auktoriseringsmodellen, API-nyckelscoping, teamhantering och granskningsloggning.

::: tip Relaterade sidor
[OIDC / SSO](/sv/guide/oidc) | [SAML SSO](/sv/guide/saml) | [SCIM-provisionering](/sv/guide/scim) | [Säkerhet och härdning](/sv/guide/security)
:::

## Användare {#users}

### Skapa användare {#creating-users}

Administratörer kan skapa användare via administratörspanelen eller `POST /api/auth/register`-slutpunkten. Varje användare har ett användarnamn, en roll, en teamtilldelning och en valfri e-postadress.

### Standardadministratör {#default-admin}

Vid första uppstart skapar SnapOtter ett standardadministratörskonto. Inloggningsuppgifterna kommer från miljövariabler:

| Variabel | Standard | Beskrivning |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | Användarnamn för det initiala administratörskontot |
| `DEFAULT_PASSWORD` | `admin` | Lösenord för det initiala administratörskontot |

Standardadministratören måste byta lösenord vid första inloggningen.

### Autentiseringsleverantörer {#authentication-providers}

Användare kan autentisera sig via flera metoder:

- **Lokal** - användarnamn och lösenord lagrade i SnapOtter-databasen
- **OIDC** - valfri OpenID Connect-leverantör (se [OIDC / SSO](/sv/guide/oidc))
- **SAML** - SAML 2.0-identitetsleverantörer (se [SAML SSO](/sv/guide/saml))
- **SCIM** - automatiserad provisionering från en identitetsleverantör (se [SCIM-provisionering](/sv/guide/scim))

### Inaktivera autentisering {#disabling-authentication}

Ange `AUTH_ENABLED=false` för att inaktivera autentisering helt. I det här läget används en syntetisk anonym användare med rollen `admin` för alla förfrågningar. Ingen inloggning krävs.

::: warning 
Att inaktivera autentisering ger full administratörsåtkomst till alla som kan nå instansen. Använd endast detta i betrodda miljöer.
:::

## Inbyggda roller {#built-in-roles}

SnapOtter inkluderar tre inbyggda roller. De kan inte ändras eller raderas.

### Admin {#admin}

Alla 17 behörigheter. Full kontroll över instansen.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 behörigheter. Kan använda alla verktyg och hantera alla filer och pipelines, men kan inte komma åt administratörsfunktioner.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 behörigheter. Kan använda verktyg och hantera sina egna resurser.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Behörighetsreferens {#permissions-reference}

| Behörighet | Beskrivning |
|---|---|
| `tools:use` | Använd valfritt bearbetningsverktyg |
| `files:own` | Visa och hantera egna filer |
| `files:all` | Visa och hantera alla användares filer |
| `apikeys:own` | Skapa och hantera egna API-nycklar |
| `apikeys:all` | Visa alla användares API-nycklar |
| `pipelines:own` | Skapa och hantera egna pipelines |
| `pipelines:all` | Visa och hantera alla användares pipelines |
| `settings:read` | Visa instansinställningar |
| `settings:write` | Ändra instansinställningar |
| `users:manage` | Skapa, uppdatera och radera användarkonton |
| `teams:manage` | Skapa, uppdatera och radera team |
| `features:manage` | Installera och hantera AI-funktionsbuntar |
| `system:health` | Åtkomst till health- och readiness-slutpunkter |
| `audit:read` | Visa granskningsloggen och lista roller |
| `compliance:manage` | Hantera GDPR-livscykel och efterlevnadsfunktioner |
| `webhooks:manage` | Konfigurera utgående webhooks |
| `security:manage` | Hantera säkerhetsinställningar (IP-tillåtelselista, SSO-tvingande) |

## Anpassade roller {#custom-roles}

Administratörer med behörigheten `security:manage` kan skapa anpassade roller via administratörspanelen eller roles-API:et. Att lista roller kräver `audit:read`.

### Skapa en anpassad roll {#creating-a-custom-role}

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

Rollnamn måste vara 2-30 tecken, gemena alfanumeriska med bindestreck och understreck.

### Administratörsreserverade behörigheter {#admin-reserved-permissions}

Tre behörigheter är reserverade för inbyggda roller och kan inte tilldelas anpassade roller:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

roles-API:et avvisar varje förfrågan som inkluderar dessa behörigheter. Endast den inbyggda `admin`-rollen har åtkomst till dem.

### Behörigheter på verktygsnivå {#tool-level-permissions}

Anpassade roller kan valfritt begränsa vilka verktyg användare får komma åt. Två lägen finns tillgängliga:

| Läge | Beteende | Licenskrav |
|---|---|---|
| `category` | Begränsa per modalitet (bild, video, ljud, dokument, fil) | Inget (gratis) |
| `tool` | Begränsa per enskilt verktygs-ID | Kräver enterprise-funktionen `per_tool_permissions` |

När läget `tool` är satt men enterprise-funktionen inte är tillgänglig, degraderar SnapOtter graciöst och tillåter åtkomst till alla verktyg.

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

### Radera en anpassad roll {#deleting-a-custom-role}

När en anpassad roll raderas tilldelas alla användare som tilldelats den automatiskt om till rollen `user`.

## Team {#teams}

Team grupperar användare för lagrings- och lagringshantering. Ett `Default`-team skapas vid första uppstart.

| Fält | Typ | Beskrivning |
|---|---|---|
| `name` | string | Unikt teamnamn (1-50 tecken) |
| `storageQuota` | number | Lagringsgräns per team i byte (fungerar utan enterprise) |
| `retentionHours` | number | Radera utdata automatiskt efter så här många timmar (kräver `team_retention_overrides`, enterprise) |
| `legalHold` | boolean | Förhindra automatisk radering av teammedlemmars filer (kräver `legal_hold`, enterprise) |

::: info 
Teamet `Default` kan inte raderas. Team som fortfarande har medlemmar kan inte raderas. Tilldela om medlemmar först.
:::

## API-nycklar {#api-keys}

Användare kan generera API-nycklar för programmatisk åtkomst. Varje nyckel använder prefixet `si_` och visas endast en gång vid skapandet.

### Scopade behörigheter {#scoped-permissions}

API-nycklar kan valfritt bära en `permissions`-array. När den är satt är de effektiva behörigheterna för en förfrågan **snittet** av användarens rollbehörigheter och nyckelns scopade behörigheter. Detta innebär att en API-nyckel aldrig kan eskalera bortom användarens egna behörigheter.

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

### Utgång {#expiration}

Nycklar accepterar en valfri `expiresAt`-tidsstämpel. Utgångna nycklar avvisas vid autentiseringstillfället.

## Granskningslogg {#audit-log}

SnapOtter registrerar säkerhetsrelevanta händelser i en strukturerad granskningslogg som lagras i databastabellen `audit_log`.

### Visa granskningsloggen {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

Kräver behörigheten `audit:read`. Stöder paginering (`page`, `limit`) och filter (`action`, `ip`, `from`, `to`).

### Granskning av verktygsoperationer {#tool-operation-auditing}

::: warning 
`TOOL_EXECUTED`-händelser loggas **inte** som standard. De aktiveras via någon av två vägar:

1. Ange administratörsinställningen `auditToolOperations` till `true`.
2. Inneha en aktiv licens med funktionen `audit_export` (tillgänglig på både team- och enterprise-planer).

Utan någon av dessa registreras inte enskilda verktygskörningar i granskningsloggen.
:::

### Exportera {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

Kräver behörigheten `audit:read` och enterprise-funktionen `audit_export` (tillgänglig på både team- och enterprise-planer). Stöder CSV- och JSON-format, filtrerat efter `action`, `actorId`, `targetType`, `targetId`, `from` och `to`.

### Manipuleringsbeständig signering {#tamper-resistant-signing}

När det är aktiverat signeras varje granskningsloggpost med en HMAC härledd från `DATA_ENCRYPTION_KEY`. Detta kräver:

1. Att ange `DATA_ENCRYPTION_KEY` i din miljö.
2. Att aktivera administratörsinställningen `tamperResistantAudit`.
3. En enterprise-licens med funktionen `tamper_resistant_audit`.

### Lagring {#retention}

Ange `AUDIT_RETENTION_DAYS` för att automatiskt rensa gamla poster. Standarden är `0`, vilket innebär att poster behålls på obestämd tid.

### Händelsereferens {#event-reference}

| Händelse | Kategori |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Autentisering |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Autentisering |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Autentisering |
| `LOGOUT` | Autentisering |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | Användarhantering |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | Användarhantering |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Roller |
| `API_KEY_CREATED`, `API_KEY_DELETED` | API-nycklar |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Inställningar |
| `FILE_UPLOADED`, `FILE_DELETED` | Filer |
| `TOOL_EXECUTED` | Verktyg (opt-in) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Efterlevnad |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Efterlevnad |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Konfiguration |

## Sessionshantering {#session-management}

Sessioner är cookie-baserade, styrda av `SESSION_DURATION_HOURS` (standard: 168 timmar / 7 dagar).

### Rolländringar ogiltigförklarar sessioner {#role-changes-invalidate-sessions}

När en administratör ändrar en användares roll raderas alla den användarens aktiva sessioner. Användaren måste logga in igen för att plocka upp sina nya behörigheter.

### Säkerhetsspärrar {#safety-guards}

- **Skydd för sista administratören**: den sista kvarvarande administratören kan inte degraderas till en lägre roll. API:et returnerar ett fel om du försöker.
- **Förhindrande av självradering**: administratörer kan inte radera sitt eget konto via API:et.
