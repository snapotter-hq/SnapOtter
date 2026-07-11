---
description: "Gestisci utenti, ruoli integrati e personalizzati, permessi, chiavi API, team, sessioni e il log di audit in SnapOtter."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: c77cc53481fb
---

# Utenti, ruoli e permessi {#users-roles-permissions}

SnapOtter include tre ruoli integrati, 17 permessi granulari e il supporto per ruoli personalizzati con controllo opzionale dell'accesso per singolo strumento. Questa pagina copre l'intero modello di autorizzazione, lo scope delle chiavi API, la gestione dei team e il logging di audit.

::: tip Pagine correlate
[OIDC / SSO](/it/guide/oidc) | [SAML SSO](/it/guide/saml) | [Provisioning SCIM](/it/guide/scim) | [Sicurezza e hardening](/it/guide/security)
:::

## Utenti {#users}

### Creazione degli utenti {#creating-users}

Gli amministratori possono creare utenti tramite il pannello di amministrazione o l'endpoint `POST /api/auth/register`. Ogni utente ha un nome utente, un ruolo, un'assegnazione a un team e un indirizzo email opzionale.

### Amministratore predefinito {#default-admin}

Al primo avvio SnapOtter crea un account amministratore predefinito. Le credenziali provengono da variabili d'ambiente:

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | Nome utente per l'account amministratore iniziale |
| `DEFAULT_PASSWORD` | `admin` | Password per l'account amministratore iniziale |

L'amministratore predefinito è tenuto a cambiare la propria password al primo accesso.

### Provider di autenticazione {#authentication-providers}

Gli utenti possono autenticarsi tramite diversi metodi:

- **Locale** - nome utente e password memorizzati nel database di SnapOtter
- **OIDC** - qualsiasi provider OpenID Connect (vedi [OIDC / SSO](/it/guide/oidc))
- **SAML** - provider di identità SAML 2.0 (vedi [SAML SSO](/it/guide/saml))
- **SCIM** - provisioning automatizzato da un provider di identità (vedi [Provisioning SCIM](/it/guide/scim))

### Disabilitare l'autenticazione {#disabling-authentication}

Imposta `AUTH_ENABLED=false` per disabilitare completamente l'autenticazione. In questa modalità viene usato un utente anonimo sintetico con ruolo `admin` per tutte le richieste. Non è richiesto alcun accesso.

::: warning 
Disabilitare l'autenticazione concede pieno accesso da amministratore a chiunque possa raggiungere l'istanza. Usalo solo in ambienti fidati.
:::

## Ruoli integrati {#built-in-roles}

SnapOtter include tre ruoli integrati. Non possono essere modificati né eliminati.

### Admin {#admin}

Tutti e 17 i permessi. Controllo completo sull'istanza.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 permessi. Può usare tutti gli strumenti e gestire tutti i file e le pipeline, ma non può accedere alle funzioni di amministrazione.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 permessi. Può usare gli strumenti e gestire le proprie risorse.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Riferimento dei permessi {#permissions-reference}

| Permesso | Descrizione |
|---|---|
| `tools:use` | Usare qualsiasi strumento di elaborazione |
| `files:own` | Visualizzare e gestire i propri file |
| `files:all` | Visualizzare e gestire i file di tutti gli utenti |
| `apikeys:own` | Creare e gestire le proprie chiavi API |
| `apikeys:all` | Visualizzare le chiavi API di tutti gli utenti |
| `pipelines:own` | Creare e gestire le proprie pipeline |
| `pipelines:all` | Visualizzare e gestire le pipeline di tutti gli utenti |
| `settings:read` | Visualizzare le impostazioni dell'istanza |
| `settings:write` | Modificare le impostazioni dell'istanza |
| `users:manage` | Creare, aggiornare ed eliminare account utente |
| `teams:manage` | Creare, aggiornare ed eliminare team |
| `features:manage` | Installare e gestire i bundle di funzionalità AI |
| `system:health` | Accedere agli endpoint di salute e prontezza |
| `audit:read` | Visualizzare il log di audit ed elencare i ruoli |
| `compliance:manage` | Gestire il ciclo di vita GDPR e le funzionalità di conformità |
| `webhooks:manage` | Configurare i webhook in uscita |
| `security:manage` | Gestire le impostazioni di sicurezza (allowlist IP, imposizione SSO) |

## Ruoli personalizzati {#custom-roles}

Gli amministratori con il permesso `security:manage` possono creare ruoli personalizzati tramite il pannello di amministrazione o l'API dei ruoli. L'elenco dei ruoli richiede `audit:read`.

### Creazione di un ruolo personalizzato {#creating-a-custom-role}

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

I nomi dei ruoli devono avere da 2 a 30 caratteri, alfanumerici minuscoli con trattini e trattini bassi.

### Permessi riservati agli amministratori {#admin-reserved-permissions}

Tre permessi sono riservati ai ruoli integrati e non possono essere assegnati ai ruoli personalizzati:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

L'API dei ruoli rifiuta qualsiasi richiesta che includa questi permessi. Solo il ruolo integrato `admin` vi ha accesso.

### Permessi a livello di strumento {#tool-level-permissions}

I ruoli personalizzati possono facoltativamente limitare quali strumenti gli utenti possono usare. Sono disponibili due modalità:

| Modalità | Comportamento | Requisito di licenza |
|---|---|---|
| `category` | Limita per modalità (immagine, video, audio, documento, file) | Nessuno (gratuito) |
| `tool` | Limita per ID del singolo strumento | Richiede la funzionalità enterprise `per_tool_permissions` |

Quando è impostata la modalità `tool` ma la funzionalità enterprise non è disponibile, SnapOtter si degrada in modo controllato e consente l'accesso a tutti gli strumenti.

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

### Eliminazione di un ruolo personalizzato {#deleting-a-custom-role}

Quando un ruolo personalizzato viene eliminato, tutti gli utenti ad esso assegnati vengono automaticamente riassegnati al ruolo `user`.

## Team {#teams}

I team raggruppano gli utenti per la gestione dell'archiviazione e della conservazione. Un team `Default` viene creato al primo avvio.

| Campo | Tipo | Descrizione |
|---|---|---|
| `name` | string | Nome univoco del team (1-50 caratteri) |
| `storageQuota` | number | Limite di archiviazione per team in byte (funziona senza enterprise) |
| `retentionHours` | number | Elimina automaticamente gli output dopo questo numero di ore (richiede `team_retention_overrides`, enterprise) |
| `legalHold` | boolean | Impedisce l'eliminazione automatica dei file dei membri del team (richiede `legal_hold`, enterprise) |

::: info 
Il team `Default` non può essere eliminato. I team che hanno ancora membri non possono essere eliminati. Riassegna prima i membri.
:::

## Chiavi API {#api-keys}

Gli utenti possono generare chiavi API per l'accesso programmatico. Ogni chiave usa il prefisso `si_` e viene mostrata una sola volta al momento della creazione.

### Permessi con scope {#scoped-permissions}

Le chiavi API possono facoltativamente portare un array `permissions`. Quando è impostato, i permessi effettivi per una richiesta sono l'**intersezione** tra i permessi del ruolo dell'utente e i permessi con scope della chiave. Questo significa che una chiave API non può mai superare i permessi propri dell'utente.

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

### Scadenza {#expiration}

Le chiavi accettano un timestamp `expiresAt` opzionale. Le chiavi scadute vengono rifiutate al momento dell'autenticazione.

## Log di audit {#audit-log}

SnapOtter registra gli eventi rilevanti per la sicurezza in un log di audit strutturato memorizzato nella tabella di database `audit_log`.

### Visualizzazione del log di audit {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

Richiede il permesso `audit:read`. Supporta la paginazione (`page`, `limit`) e i filtri (`action`, `ip`, `from`, `to`).

### Audit delle operazioni sugli strumenti {#tool-operation-auditing}

::: warning 
Gli eventi `TOOL_EXECUTED` **non** vengono registrati per impostazione predefinita. Sono attivabili tramite uno di due percorsi:

1. Imposta l'impostazione di amministrazione `auditToolOperations` su `true`.
2. Possiedi una licenza attiva con la funzionalità `audit_export` (disponibile sia sui piani team sia enterprise).

Senza uno di questi, le singole esecuzioni degli strumenti non vengono registrate nel log di audit.
:::

### Esportazione {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

Richiede il permesso `audit:read` e la funzionalità enterprise `audit_export` (disponibile sia sui piani team sia enterprise). Supporta i formati CSV e JSON, filtrati per `action`, `actorId`, `targetType`, `targetId`, `from` e `to`.

### Firma resistente alla manomissione {#tamper-resistant-signing}

Quando è abilitata, ogni voce del log di audit viene firmata con un HMAC derivato da `DATA_ENCRYPTION_KEY`. Questo richiede:

1. Impostare `DATA_ENCRYPTION_KEY` nel tuo ambiente.
2. Abilitare l'impostazione di amministrazione `tamperResistantAudit`.
3. Una licenza enterprise con la funzionalità `tamper_resistant_audit`.

### Conservazione {#retention}

Imposta `AUDIT_RETENTION_DAYS` per eliminare automaticamente le voci vecchie. Il valore predefinito è `0`, il che significa che le voci vengono conservate a tempo indeterminato.

### Riferimento degli eventi {#event-reference}

| Evento | Categoria |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Autenticazione |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Autenticazione |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Autenticazione |
| `LOGOUT` | Autenticazione |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | Gestione utenti |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | Gestione utenti |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Ruoli |
| `API_KEY_CREATED`, `API_KEY_DELETED` | Chiavi API |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Impostazioni |
| `FILE_UPLOADED`, `FILE_DELETED` | File |
| `TOOL_EXECUTED` | Strumenti (opt-in) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Conformità |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Conformità |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Configurazione |

## Gestione delle sessioni {#session-management}

Le sessioni sono basate su cookie, controllate da `SESSION_DURATION_HOURS` (predefinito: 168 ore / 7 giorni).

### Le modifiche di ruolo invalidano le sessioni {#role-changes-invalidate-sessions}

Quando un amministratore cambia il ruolo di un utente, tutte le sessioni attive di quell'utente vengono eliminate. L'utente deve accedere di nuovo per acquisire i nuovi permessi.

### Protezioni di sicurezza {#safety-guards}

- **Protezione dell'ultimo amministratore**: l'ultimo amministratore rimasto non può essere retrocesso a un ruolo inferiore. L'API restituisce un errore se ci provi.
- **Prevenzione dell'auto-eliminazione**: gli amministratori non possono eliminare il proprio account tramite l'API.
