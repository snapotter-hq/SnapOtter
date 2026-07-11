---
description: "Verwalte Benutzer, integrierte und benutzerdefinierte Rollen, Berechtigungen, API-Schlüssel, Teams, Sitzungen und das Audit-Log in SnapOtter."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: 5794e14e4e84
---

# Benutzer, Rollen & Berechtigungen {#users-roles-permissions}

SnapOtter wird mit drei integrierten Rollen, 17 granularen Berechtigungen und Unterstützung für benutzerdefinierte Rollen mit optionaler Zugriffssteuerung pro Werkzeug ausgeliefert. Diese Seite behandelt das vollständige Autorisierungsmodell, die Bereichseinschränkung von API-Schlüsseln, die Teamverwaltung und das Audit-Logging.

::: tip Verwandte Seiten
[OIDC / SSO](/de/guide/oidc) | [SAML SSO](/de/guide/saml) | [SCIM-Bereitstellung](/de/guide/scim) | [Sicherheit & Härtung](/de/guide/security)
:::

## Benutzer {#users}

### Benutzer erstellen {#creating-users}

Administratoren können Benutzer über das Admin-Panel oder den `POST /api/auth/register`-Endpunkt erstellen. Jeder Benutzer hat einen Benutzernamen, eine Rolle, eine Teamzuordnung und eine optionale E-Mail-Adresse.

### Standard-Administrator {#default-admin}

Beim ersten Start erstellt SnapOtter ein Standard-Administratorkonto. Die Zugangsdaten stammen aus Umgebungsvariablen:

| Variable | Standard | Beschreibung |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | Benutzername für das anfängliche Administratorkonto |
| `DEFAULT_PASSWORD` | `admin` | Passwort für das anfängliche Administratorkonto |

Der Standard-Administrator muss beim ersten Login sein Passwort ändern.

### Authentifizierungsanbieter {#authentication-providers}

Benutzer können sich über mehrere Methoden authentifizieren:

- **Lokal** - Benutzername und Passwort, gespeichert in der SnapOtter-Datenbank
- **OIDC** - jeder OpenID-Connect-Anbieter (siehe [OIDC / SSO](/de/guide/oidc))
- **SAML** - SAML-2.0-Identitätsanbieter (siehe [SAML SSO](/de/guide/saml))
- **SCIM** - automatisierte Bereitstellung durch einen Identitätsanbieter (siehe [SCIM-Bereitstellung](/de/guide/scim))

### Authentifizierung deaktivieren {#disabling-authentication}

Setze `AUTH_ENABLED=false`, um die Authentifizierung vollständig zu deaktivieren. In diesem Modus wird für alle Anfragen ein synthetischer anonymer Benutzer mit der Rolle `admin` verwendet. Es ist kein Login erforderlich.

::: warning 
Das Deaktivieren der Authentifizierung gewährt jedem, der die Instanz erreichen kann, vollen Administratorzugriff. Verwende dies nur in vertrauenswürdigen Umgebungen.
:::

## Integrierte Rollen {#built-in-roles}

SnapOtter enthält drei integrierte Rollen. Sie können weder geändert noch gelöscht werden.

### Admin {#admin}

Alle 17 Berechtigungen. Volle Kontrolle über die Instanz.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 Berechtigungen. Kann alle Werkzeuge verwenden und alle Dateien und Pipelines verwalten, aber nicht auf Administratorfunktionen zugreifen.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 Berechtigungen. Kann Werkzeuge verwenden und eigene Ressourcen verwalten.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Berechtigungsreferenz {#permissions-reference}

| Berechtigung | Beschreibung |
|---|---|
| `tools:use` | Jedes Verarbeitungswerkzeug verwenden |
| `files:own` | Eigene Dateien ansehen und verwalten |
| `files:all` | Dateien aller Benutzer ansehen und verwalten |
| `apikeys:own` | Eigene API-Schlüssel erstellen und verwalten |
| `apikeys:all` | API-Schlüssel aller Benutzer ansehen |
| `pipelines:own` | Eigene Pipelines erstellen und verwalten |
| `pipelines:all` | Pipelines aller Benutzer ansehen und verwalten |
| `settings:read` | Instanzeinstellungen ansehen |
| `settings:write` | Instanzeinstellungen ändern |
| `users:manage` | Benutzerkonten erstellen, aktualisieren und löschen |
| `teams:manage` | Teams erstellen, aktualisieren und löschen |
| `features:manage` | KI-Feature-Bundles installieren und verwalten |
| `system:health` | Auf Health- und Readiness-Endpunkte zugreifen |
| `audit:read` | Das Audit-Log ansehen und Rollen auflisten |
| `compliance:manage` | DSGVO-Lebenszyklus und Compliance-Funktionen verwalten |
| `webhooks:manage` | Ausgehende Webhooks konfigurieren |
| `security:manage` | Sicherheitseinstellungen verwalten (IP-Zulassungsliste, SSO-Erzwingung) |

## Benutzerdefinierte Rollen {#custom-roles}

Administratoren mit der Berechtigung `security:manage` können benutzerdefinierte Rollen über das Admin-Panel oder die Rollen-API erstellen. Das Auflisten von Rollen erfordert `audit:read`.

### Eine benutzerdefinierte Rolle erstellen {#creating-a-custom-role}

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

Rollennamen müssen 2 bis 30 Zeichen lang sein, kleingeschrieben alphanumerisch mit Bindestrichen und Unterstrichen.

### Für Administratoren reservierte Berechtigungen {#admin-reserved-permissions}

Drei Berechtigungen sind für integrierte Rollen reserviert und können benutzerdefinierten Rollen nicht zugewiesen werden:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

Die Rollen-API weist jede Anfrage ab, die diese Berechtigungen enthält. Nur die integrierte Rolle `admin` hat Zugriff darauf.

### Berechtigungen auf Werkzeugebene {#tool-level-permissions}

Benutzerdefinierte Rollen können optional einschränken, auf welche Werkzeuge Benutzer zugreifen dürfen. Zwei Modi sind verfügbar:

| Modus | Verhalten | Lizenzanforderung |
|---|---|---|
| `category` | Einschränkung nach Modalität (Bild, Video, Audio, Dokument, Datei) | Keine (kostenlos) |
| `tool` | Einschränkung nach einzelner Werkzeug-ID | Erfordert das Enterprise-Feature `per_tool_permissions` |

Wenn der Modus `tool` gesetzt ist, das Enterprise-Feature aber nicht verfügbar ist, degradiert SnapOtter kontrolliert und erlaubt den Zugriff auf alle Werkzeuge.

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

### Eine benutzerdefinierte Rolle löschen {#deleting-a-custom-role}

Wenn eine benutzerdefinierte Rolle gelöscht wird, werden alle ihr zugewiesenen Benutzer automatisch der Rolle `user` neu zugewiesen.

## Teams {#teams}

Teams gruppieren Benutzer für die Speicher- und Aufbewahrungsverwaltung. Ein `Default`-Team wird beim ersten Start erstellt.

| Feld | Typ | Beschreibung |
|---|---|---|
| `name` | string | Eindeutiger Teamname (1 bis 50 Zeichen) |
| `storageQuota` | number | Speicherlimit pro Team in Bytes (funktioniert ohne Enterprise) |
| `retentionHours` | number | Ausgaben nach dieser Anzahl von Stunden automatisch löschen (erfordert `team_retention_overrides`, Enterprise) |
| `legalHold` | boolean | Automatisches Löschen der Dateien von Teammitgliedern verhindern (erfordert `legal_hold`, Enterprise) |

::: info 
Das `Default`-Team kann nicht gelöscht werden. Teams, die noch Mitglieder haben, können nicht gelöscht werden. Weise die Mitglieder zuerst neu zu.
:::

## API-Schlüssel {#api-keys}

Benutzer können API-Schlüssel für programmatischen Zugriff generieren. Jeder Schlüssel verwendet das Präfix `si_` und wird nur einmal bei der Erstellung angezeigt.

### Bereichseingeschränkte Berechtigungen {#scoped-permissions}

API-Schlüssel können optional ein `permissions`-Array tragen. Wenn gesetzt, sind die effektiven Berechtigungen für eine Anfrage die **Schnittmenge** der Rollenberechtigungen des Benutzers und der bereichseingeschränkten Berechtigungen des Schlüssels. Das bedeutet, ein API-Schlüssel kann nie über die eigenen Berechtigungen des Benutzers hinaus eskalieren.

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

### Ablauf {#expiration}

Schlüssel akzeptieren einen optionalen `expiresAt`-Zeitstempel. Abgelaufene Schlüssel werden bei der Authentifizierung abgewiesen.

## Audit-Log {#audit-log}

SnapOtter zeichnet sicherheitsrelevante Ereignisse in einem strukturierten Audit-Log auf, das in der Datenbanktabelle `audit_log` gespeichert wird.

### Das Audit-Log ansehen {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

Erfordert die Berechtigung `audit:read`. Unterstützt Seitennummerierung (`page`, `limit`) und Filter (`action`, `ip`, `from`, `to`).

### Auditing von Werkzeugoperationen {#tool-operation-auditing}

::: warning 
`TOOL_EXECUTED`-Ereignisse werden standardmäßig **nicht** protokolliert. Sie sind über einen von zwei Wegen aktivierbar (Opt-in):

1. Setze die Admin-Einstellung `auditToolOperations` auf `true`.
2. Halte eine aktive Lizenz mit dem Feature `audit_export` (verfügbar sowohl in den Team- als auch in den Enterprise-Tarifen).

Ohne eine dieser Optionen werden einzelne Werkzeugausführungen nicht im Audit-Log erfasst.
:::

### Exportieren {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

Erfordert die Berechtigung `audit:read` und das Enterprise-Feature `audit_export` (verfügbar sowohl in den Team- als auch in den Enterprise-Tarifen). Unterstützt die Formate CSV und JSON, gefiltert nach `action`, `actorId`, `targetType`, `targetId`, `from` und `to`.

### Manipulationssichere Signierung {#tamper-resistant-signing}

Wenn aktiviert, wird jeder Audit-Log-Eintrag mit einem HMAC signiert, der aus `DATA_ENCRYPTION_KEY` abgeleitet wird. Dies erfordert:

1. Das Setzen von `DATA_ENCRYPTION_KEY` in deiner Umgebung.
2. Das Aktivieren der Admin-Einstellung `tamperResistantAudit`.
3. Eine Enterprise-Lizenz mit dem Feature `tamper_resistant_audit`.

### Aufbewahrung {#retention}

Setze `AUDIT_RETENTION_DAYS`, um alte Einträge automatisch zu bereinigen. Der Standard ist `0`, was bedeutet, dass Einträge unbegrenzt aufbewahrt werden.

### Ereignisreferenz {#event-reference}

| Ereignis | Kategorie |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Authentifizierung |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Authentifizierung |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Authentifizierung |
| `LOGOUT` | Authentifizierung |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | Benutzerverwaltung |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | Benutzerverwaltung |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Rollen |
| `API_KEY_CREATED`, `API_KEY_DELETED` | API-Schlüssel |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Einstellungen |
| `FILE_UPLOADED`, `FILE_DELETED` | Dateien |
| `TOOL_EXECUTED` | Werkzeuge (Opt-in) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Compliance |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Compliance |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Konfiguration |

## Sitzungsverwaltung {#session-management}

Sitzungen sind cookiebasiert und werden über `SESSION_DURATION_HOURS` gesteuert (Standard: 168 Stunden / 7 Tage).

### Rollenänderungen machen Sitzungen ungültig {#role-changes-invalidate-sessions}

Wenn ein Administrator die Rolle eines Benutzers ändert, werden alle aktiven Sitzungen dieses Benutzers gelöscht. Der Benutzer muss sich erneut anmelden, um seine neuen Berechtigungen zu übernehmen.

### Schutzmechanismen {#safety-guards}

- **Schutz des letzten Administrators**: Der letzte verbleibende Administrator kann nicht auf eine niedrigere Rolle herabgestuft werden. Die API gibt einen Fehler zurück, wenn du es versuchst.
- **Selbstlöschungsschutz**: Administratoren können ihr eigenes Konto nicht über die API löschen.
