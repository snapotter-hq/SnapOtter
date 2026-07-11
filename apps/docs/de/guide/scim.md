---
description: "Richten Sie SCIM-2.0-Provisionierung ein, um Benutzer und Gruppen von Ihrem Identitätsanbieter mit SnapOtter zu synchronisieren. Behandelt Okta, Azure AD / Entra ID und benutzerdefinierte Integrationen."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 58dab63bf748
---

# SCIM-Provisionierung {#scim-provisioning}

SnapOtter implementiert SCIM 2.0 (System for Cross-domain Identity Management) für die automatisierte Provisionierung von Benutzern und Gruppen. Ihr Identitätsanbieter kann Benutzerkonten automatisch erstellen, aktualisieren, deaktivieren und reaktivieren sowie Gruppenmitgliedschaften synchronisieren.

::: tip Enterprise-Funktion
Die SCIM-Provisionierung erfordert eine **Enterprise**-Lizenz mit der Funktion `scim`. Sie ist im Team-Plan nicht verfügbar. Ohne diese Funktion geben alle SCIM-Endpunkte (außer Discovery) 403 zurück.
:::

## Voraussetzungen {#prerequisites}

- Eine laufende SnapOtter-Instanz, die unter einer öffentlichen URL erreichbar ist
- Einen Enterprise-Lizenzschlüssel mit der Funktion `scim`
- Admin-Zugriff auf SnapOtter (die Berechtigung `users:manage` ist erforderlich, um ein SCIM-Token zu erzeugen oder zu widerrufen)
- Admin-Zugriff auf die Provisionierungseinstellungen Ihres Identitätsanbieters

## Schnellstart {#quick-start}

1. Erzeugen Sie ein SCIM-Bearer-Token:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

Die Antwort enthält das Token. Speichern Sie es sofort; es kann nicht erneut abgerufen werden.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. Konfigurieren Sie in Ihrem Identitätsanbieter die SCIM-Provisionierung mit:
   - **Basis-URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Authentifizierung**: Bearer-Token (fügen Sie das Token aus Schritt 1 ein)

## Authentifizierung {#authentication}

SCIM-Endpunkte verwenden ein dediziertes Bearer-Token, getrennt von Benutzersitzungen und API-Schlüsseln.

### Ein Token erzeugen {#generating-a-token}

`POST /api/v1/enterprise/scim/token` erzeugt ein neues SCIM-Token. Dieser Endpunkt erfordert eine gültige Sitzung mit der Berechtigung `users:manage`.

Das Token wird genau einmal im Klartext zurückgegeben. SnapOtter speichert nur einen scrypt-Hash. Wenn Sie das Token verlieren, widerrufen Sie es und erzeugen ein neues.

Es ist immer nur ein SCIM-Token gleichzeitig aktiv. Das Erzeugen eines neuen Tokens ersetzt das vorherige.

### Ein Token widerrufen {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` widerruft das aktuelle SCIM-Token. Dieser Endpunkt erfordert ebenfalls `users:manage`.

### Ratenbegrenzung {#rate-limiting}

SCIM-Endpunkte sind auf 1000 Anfragen pro Minute und Token begrenzt. Ein Überschreiten dieses Limits gibt HTTP 429 zurück.

## Unterstützte Ressourcen {#supported-resources}

| SCIM-Ressource | SnapOtter-Konzept | Erstellen | Lesen | Aktualisieren | Löschen |
|---|---|---|---|---|---|
| User | Benutzerkonto | Ja | Ja | Ja | Soft Delete |
| Group | Team | Ja | Ja | Ja | Ja |

::: warning 
SCIM-Groups werden SnapOtter-**Teams** zugeordnet, nicht Rollen. SCIM kann die Rolle eines Benutzers nicht festlegen. Alle über SCIM erstellten Benutzer erhalten die Rolle `user`. Um die Rolle eines Benutzers zu ändern, verwenden Sie die SnapOtter-Admin-UI.
:::

## Benutzeroperationen {#user-operations}

### Benutzer erstellen {#create-user}

`POST /api/v1/scim/v2/Users`

Erstellt ein neues Benutzerkonto mit `authProvider` auf `scim` und der Rolle `user`. Der Benutzer wird dem Default-Team zugewiesen. Wenn `active` gleich `false` ist, wird stattdessen die Rolle auf `disabled` gesetzt.

Erforderliche Attribute: `userName`. Optional: `externalId`, `emails`, `active` (Standard `true`).

### Benutzer auflisten und filtern {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Gibt eine paginierte Liste von Benutzern zurück. Unterstützt die Abfrageparameter `startIndex` und `count` (maximal 200 Ergebnisse pro Seite).

Die Filterung unterstützt nur `eq` (gleich), und zwar für diese Attribute:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Andere Filteroperatoren und Attribute geben HTTP 400 zurück.

### Benutzer abrufen {#get-user}

`GET /api/v1/scim/v2/Users/:id`

Gibt einen einzelnen Benutzer anhand seiner SnapOtter-Benutzer-ID zurück.

### Benutzer ersetzen {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Ersetzt die Attribute des Benutzers. Unterstützt `userName`, `externalId`, `emails` und `active`. Änderungen des Benutzernamens werden auf Konflikte geprüft (409, wenn der neue Benutzername bereits von einem anderen Benutzer belegt ist).

### Benutzer patchen {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

Teilweise Aktualisierung über SCIM PatchOp. Unterstützte Operationen:

| Operation | Pfade |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Wie `replace` |
| `remove` | `externalId`, `emails` |

Die Pfade `name.formatted` und `displayName` werden aus Kompatibilitätsgründen akzeptiert, haben aber keine dauerhafte Wirkung (SnapOtter speichert keinen separaten Anzeigenamen).

Wertlose `replace`-Operationen (bei denen der Wert ein Objekt ohne `path` ist) werden ebenfalls unterstützt, mit den Schlüsseln `userName`, `externalId`, `emails` und `active`.

### Benutzer deaktivieren (Soft Delete) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter löscht Benutzer über SCIM nicht endgültig. Stattdessen führt DELETE eine sanfte Deaktivierung durch:

1. Die Rolle des Benutzers wird von ihrem aktuellen Wert (z. B. `editor`) auf `disabled:editor` geändert, wobei die ursprüngliche Rolle erhalten bleibt.
2. Das Passwort des Benutzers wird gelöscht.
3. Alle aktiven Sitzungen werden widerrufen.
4. Alle API-Schlüssel werden widerrufen.

Der Benutzer kann sich nicht mehr anmelden und keine API-Schlüssel mehr verwenden. Seine Daten (Dateien, Verlauf) bleiben erhalten.

### Benutzer reaktivieren {#reactivate-user}

Um einen zuvor deaktivierten Benutzer zu reaktivieren, senden Sie eine `PUT`- oder `PATCH`-Anfrage mit `active: true`. SnapOtter stellt die ursprüngliche Rolle von vor der Deaktivierung wieder her (z. B. wird aus `disabled:editor` wieder `editor`). Wenn die ursprüngliche Rolle nicht ermittelt werden kann, wird auf `user` zurückgegriffen.

::: details Beispiel: Deaktivieren und Reaktivieren per PATCH
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## Gruppenoperationen {#group-operations}

SCIM-Groups werden SnapOtter-Teams zugeordnet. Das Erstellen einer Gruppe erstellt ein Team. Die Gruppenmitgliedschaft steuert, zu welchem Team ein Benutzer gehört.

### Gruppe erstellen {#create-group}

`POST /api/v1/scim/v2/Groups`

Erforderlich: `displayName`. Optional: `members` (Array von `{ value: userId }`).

### Gruppen auflisten und filtern {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

Die Filterung unterstützt nur `displayName eq "..."`. Paginiert mit `startIndex` und `count` (maximal 200 Ergebnisse pro Seite).

### Gruppe abrufen {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Gruppe ersetzen {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Ersetzt den Gruppennamen und die vollständige Mitgliederliste. Vorhandene Mitglieder, die nicht in der neuen Liste stehen, werden in das Default-Team verschoben.

### Gruppe patchen {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Unterstützt diese Operationen:

| Operation | Pfad | Effekt |
|---|---|---|
| `add` | `members` | Fügt Benutzer zum Team hinzu |
| `remove` | `members[value eq "userId"]` | Verschiebt den Benutzer in das Default-Team |
| `replace` | `displayName` | Benennt das Team um |
| `replace` | `members` | Ersetzt alle Mitglieder (entfernte Mitglieder werden in das Default-Team verschoben) |

### Gruppe löschen {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Löscht das Team. Alle Mitglieder des gelöschten Teams werden in das Default-Team verschoben. Benutzer werden nicht deaktiviert oder gelöscht.

## IdP-Einrichtung {#idp-setup}

### Okta {#okta}

1. Öffnen Sie in der Okta-Admin-Konsole Ihre SnapOtter-Anwendung (oder erstellen Sie eine).
2. Gehen Sie zum Tab **Provisioning** und klicken Sie auf **Configure API Integration**.
3. Aktivieren Sie **Enable API Integration** und geben Sie ein:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: Das oben erzeugte SCIM-Bearer-Token
4. Klicken Sie auf **Test API Credentials** und dann auf **Save**.
5. Aktivieren Sie unter **Provisioning > To App**:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. Konfigurieren Sie unter **Push Groups**, welche Okta-Gruppen als SnapOtter-Teams synchronisiert werden sollen.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Gehen Sie im Azure-Portal zu Ihrer SnapOtter-Enterprise-Anwendung.
2. Gehen Sie zu **Provisioning** und setzen Sie **Provisioning Mode** auf **Automatic**.
3. Geben Sie unter **Admin Credentials** ein:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: Das oben erzeugte SCIM-Bearer-Token
4. Klicken Sie auf **Test Connection** und dann auf **Save**.
5. Konfigurieren Sie unter **Mappings** die Attributzuordnungen für Benutzer und Gruppen. Die Standardwerte funktionieren in der Regel, prüfen Sie aber, dass `userName` wie gewünscht auf `userPrincipalName` oder `mail` abgebildet wird.
6. Setzen Sie **Provisioning Status** auf **On** und speichern Sie.

Azure provisioniert Benutzer und Gruppen in einem festen Synchronisationszyklus (typischerweise alle 40 Minuten).

## Discovery-Endpunkte {#discovery-endpoints}

Diese drei Endpunkte sind ohne Authentifizierung verfügbar und beschreiben die Fähigkeiten des SCIM-Servers:

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Serverfähigkeiten und unterstützte Funktionen |
| `GET /api/v1/scim/v2/Schemas` | Schemadefinitionen für User und Group |
| `GET /api/v1/scim/v2/ResourceTypes` | Verfügbare Ressourcentypen (User, Group) |

`ServiceProviderConfig` bewirbt diese Fähigkeiten:

| Funktion | Unterstützt |
|---|---|
| Patch | Ja |
| Bulk | Nein |
| Filter | Ja (max. 200 Ergebnisse, nur `eq`-Operator) |
| Passwort ändern | Nein |
| Sort | Nein |
| ETag | Nein |

## Einschränkungen {#limitations}

- **Filterung**: Nur der `eq`-Operator wird unterstützt. Komplexe Filter, die Operatoren `and`/`or`, `co` (enthält) und `sw` (beginnt mit) sind nicht implementiert.
- **Massenoperationen**: Nicht unterstützt.
- **Sort und ETag**: Nicht unterstützt.
- **Rollen**: SCIM kann keine SnapOtter-Rollen zuweisen. Alle provisionierten Benutzer erhalten die Rolle `user`.
- **MAX_USERS**: Die Grenze der Umgebungsvariablen `MAX_USERS` wird bei der SCIM-Benutzererstellung nicht durchgesetzt. Wenn Sie die Benutzeranzahl begrenzen müssen, verwalten Sie die Zuweisungen in Ihrem IdP.
- **Ein Token**: Es kann immer nur ein SCIM-Token gleichzeitig aktiv sein. Wenn mehrere IdPs SCIM-Zugriff benötigen, müssen sie sich das Token teilen.
- **Gruppen sind Teams**: SCIM-Groups entsprechen Teams, nicht Rollen oder Berechtigungsgruppen.

## Fehlerbehebung {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

Ihre Lizenz enthält die Funktion `scim` nicht, oder es ist keine Lizenz konfiguriert. SCIM erfordert eine Enterprise-Plan-Lizenz. Stellen Sie sicher, dass `SNAPOTTER_LICENSE_KEY` gesetzt ist und die Lizenz die Funktion `scim` enthält.

### 401 "Bearer token required" {#_401-bearer-token-required}

Die SCIM-Anfrage enthielt keinen `Authorization: Bearer <token>`-Header. Prüfen Sie die Provisionierungskonfiguration Ihres IdP.

### 401 "Invalid token" {#_401-invalid-token}

Das Token stimmt nicht mit dem gespeicherten Hash überein. Das passiert, wenn das Token widerrufen und neu erzeugt wurde. Aktualisieren Sie das Token in den Provisionierungseinstellungen Ihres IdP.

### 401 "SCIM not configured" {#_401-scim-not-configured}

Es wurde noch kein SCIM-Token erzeugt. Verwenden Sie den Endpunkt `POST /api/v1/enterprise/scim/token`, um eines zu erstellen.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

Ein Benutzer mit demselben Benutzernamen existiert bereits. Das kann passieren, wenn ein IdP eine fehlgeschlagene Erstellung wiederholt. Prüfen Sie im SnapOtter-Admin-Panel auf doppelte Benutzernamen.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

Der IdP sendet mehr als 1000 Anfragen pro Minute. Das passiert typischerweise während einer großen initialen Synchronisation. Die meisten IdPs wiederholen automatisch, nachdem das Zeitfenster der Ratenbegrenzung zurückgesetzt wurde. Wenn das Problem weiterhin besteht, prüfen Sie das Provisionierungs-Synchronisationsintervall Ihres IdP.

### Benutzer wurden deprovisioniert, aber nicht aus der UI entfernt {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE ist eine sanfte Deaktivierung. Deaktivierte Benutzer erscheinen weiterhin in der Admin-Benutzerliste mit einem deaktivierten Status. Das ist so beabsichtigt, damit ihre Daten erhalten bleiben. Ihre Rolle wird als `disabled:<original-role>` angezeigt.
