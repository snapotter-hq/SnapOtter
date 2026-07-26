---
description: "PostgreSQL-Datenbankschema, Tabellen, Migrationen und Backup-Verfahren für SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 37efb265dd4b
i18n_hash_version: 2
---

# Datenbank {#database}

SnapOtter verwendet PostgreSQL 17 mit [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) für die Datenpersistenz. Das Schema ist in `apps/api/src/db/schema.ts` definiert.

Die Verbindung wird über die Umgebungsvariable `DATABASE_URL` konfiguriert (Standard `postgres://snapotter:snapotter@postgres:5432/snapotter`). In Docker Compose speichert der Postgres-Container seine Daten im benannten Volume `SnapOtter-pgdata`.

## Tabellen {#tables}

### users {#users}

Speichert Benutzerkonten. Wird beim ersten Start automatisch aus `DEFAULT_USERNAME` und `DEFAULT_PASSWORD` erstellt.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | uuid | Primärschlüssel |
| `username` | varchar | Eindeutig, erforderlich |
| `passwordHash` | varchar | scrypt-Hash |
| `role` | varchar | `admin`, `editor` oder `user` |
| `mustChangePassword` | boolean | Flag für erzwungenes Zurücksetzen des Passworts |
| `createdAt` | timestamp | Erstellungszeitpunkt |
| `updatedAt` | timestamp | Zeitpunkt der letzten Aktualisierung |

### sessions {#sessions}

Aktive Anmelde-Sitzungen. Jede Zeile verknüpft ein Sitzungstoken mit einem Benutzer.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | varchar | Primärschlüssel (Sitzungstoken) |
| `userId` | uuid | Fremdschlüssel auf `users.id` |
| `expiresAt` | timestamp | Ablaufzeitpunkt |
| `createdAt` | timestamp | Erstellungszeitpunkt |

### teams {#teams}

Gruppen zum Organisieren von Benutzern. Admins können Benutzer Teams zuweisen.

| Spalte | Typ | Beschreibung |
|--------|------|-------------|
| `id` | uuid | Primärschlüssel |
| `name` | varchar (eindeutig, max. 50 Zeichen) | Teamname |
| `createdAt` | timestamp | Erstellungszeitpunkt |

### api_keys {#api-keys}

API-Schlüssel für den programmatischen Zugriff. Der rohe Schlüssel wird nur einmal bei der Erstellung angezeigt; gespeichert wird nur der Hash.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | uuid | Primärschlüssel |
| `userId` | uuid | Fremdschlüssel auf `users.id` |
| `keyHash` | varchar | scrypt-Hash des Schlüssels |
| `name` | varchar | Vom Benutzer vergebene Bezeichnung |
| `createdAt` | timestamp | Erstellungszeitpunkt |
| `lastUsedAt` | timestamp | Bei jeder authentifizierten Anfrage aktualisiert |

Schlüssel haben das Präfix `si_` gefolgt von 96 Hex-Zeichen (48 zufällige Bytes).

### pipelines {#pipelines}

Gespeicherte Tool-Ketten, die Benutzer in der Oberfläche erstellen.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | uuid | Primärschlüssel |
| `name` | varchar | Pipeline-Name |
| `description` | varchar | Optionale Beschreibung |
| `steps` | jsonb | Array von `{ toolId, settings }`-Objekten |
| `createdAt` | timestamp | Erstellungszeitpunkt |

### user_files {#user-files}

Persistente Dateibibliothek. Ein gespeicherter Edit wird standardmäßig als eigenständige Root-Zeile eingefügt ("Als neu speichern": `version` 1, `parentId` null, sodass das Original weiterhin gelistet bleibt), oder als übergeordnet verknüpfte Version, wenn du das Original überschreibst (`parentId` gesetzt, `version` erhöht, das Original wird abgelöst). Die Spalte `toolChain` erfasst die angewendeten Werkzeuge.

| Spalte | Typ | Beschreibung |
|--------|------|-------------|
| `id` | uuid | Primärschlüssel |
| `userId` | uuid | FK auf users (CASCADE DELETE) |
| `originalName` | varchar | Ursprünglicher Upload-Dateiname |
| `storedName` | varchar | Dateiname auf dem Datenträger |
| `mimeType` | varchar | MIME-Typ |
| `size` | integer | Dateigröße in Bytes |
| `width` | integer | Bildbreite in px |
| `height` | integer | Bildhöhe in px |
| `version` | integer | Versionsnummer (1 = Original) |
| `parentId` | uuid oder null | FK auf user_files (übergeordnete Version) |
| `toolChain` | jsonb | Tool-IDs, die in Reihenfolge angewendet wurden, um diese Version zu erzeugen |
| `createdAt` | timestamp | Erstellungszeitpunkt |

### jobs {#jobs}

Verfolgt Verarbeitungs-Jobs für Fortschrittsanzeige und Bereinigung.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | uuid | Primärschlüssel |
| `type` | varchar | Tool- oder Pipeline-Bezeichner |
| `status` | varchar | `queued`, `processing`, `completed` oder `failed` |
| `progress` | real | Anteil 0.0-1.0 |
| `inputFiles` | jsonb | Array von Eingabedatei-Pfaden |
| `outputPath` | varchar | Pfad zur Ergebnisdatei |
| `settings` | jsonb | Verwendete Tool-Einstellungen |
| `error` | varchar | Fehlermeldung bei Fehlschlag |
| `createdAt` | timestamp | Erstellungszeitpunkt |
| `completedAt` | timestamp | Abschlusszeitpunkt |

### settings {#settings}

Schlüssel-Wert-Speicher für serverweite Einstellungen, die Admins über die Oberfläche ändern können.

| Spalte | Typ | Hinweise |
|---|---|---|
| `key` | varchar | Primärschlüssel |
| `value` | varchar | Einstellungswert |
| `updatedAt` | timestamp | Zeitpunkt der letzten Aktualisierung |

### roles {#roles}

Benutzerdefinierte Rollen mit granularen Berechtigungen.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | uuid | Primärschlüssel |
| `name` | varchar | Eindeutiger Rollenname |
| `description` | varchar | Optionale Beschreibung |
| `permissions` | jsonb | Array von Berechtigungs-Strings |
| `createdAt` | timestamp | Erstellungszeitpunkt |

### audit_log {#audit-log}

Protokoll sicherheitsrelevanter Aktionen.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | uuid | Primärschlüssel |
| `userId` | uuid | FK auf users |
| `action` | varchar | Aktionstyp |
| `details` | jsonb | Aktionsspezifische Daten |
| `createdAt` | timestamp | Zeitpunkt der Aktion |

### user_preferences {#user-preferences}

Oberflächenzustand pro Benutzer, abgelegt unter einem Präferenznamen. Speichert die angehefteten Tools der Startseite, die über `PUT /api/v1/preferences` geschrieben werden.

| Spalte | Typ | Hinweise |
|---|---|---|
| `userId` | text | FK auf users, kaskadierendes Löschen. Zusammen mit `key` der Primärschlüssel |
| `key` | text | Name der Präferenz. Zusammen mit `userId` der Primärschlüssel |
| `value` | jsonb | Inhalt der Präferenz |
| `updatedAt` | timestamp | Zeitpunkt des letzten Schreibvorgangs |

## Migrationen {#migrations}

Drizzle übernimmt die Schema-Migrationen. Die Migrationsdateien liegen in `apps/api/drizzle/`. Während der Entwicklung:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

In der Produktion werden ausstehende Migrationen beim Start automatisch angewendet.

## Sichern und Wiederherstellen von {#backup-and-restore}

Die relationale Datenbank befindet sich im `SnapOtter-pgdata`-Volume des Postgres-Containers, nicht im `/data`-Volume der App.

**Logische Sicherung mit Validierung (empfohlen)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Dieser Datenbank-Dump enthält keine gespeicherten Bibliotheksobjekte im `/data/files`- oder dauerhaften BullMQ-Status in Redis. Sichern und wiederherstellen Sie diese mit dem koordinierten Verfahren in [Sicherheit und Härtung](/de/guide/security#backup-and-recovery).

**Schnappschuss des kalten Volumens**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Kopieren Sie kein Live-PostgreSQL-Datenverzeichnis mit `tar`. Verfassen Sie Volume-Namen mit Präfixen nach Projekt. Lösen Sie daher die gemounteten Volume-IDs von `docker inspect` oder Ihrer Speicherplattform auf, anstatt die wörtliche Bezeichnung `SnapOtter-pgdata` anzunehmen.

### Migration von 1.x (SQLite) {#migrating-from-1-x-sqlite}

Das Upgrade von SnapOtter 1.x hat einen eigenen Leitfaden: siehe [Upgrade von 1.x auf 2.0](./upgrading). Kurz gesagt: Verwende dein bestehendes Volume `/data` weiter, und 2.0 erkennt und importiert `/data/snapotter.db` beim ersten Start automatisch (oder setze `SQLITE_MIGRATE_PATH`, um explizit darauf zu verweisen). Sichere zuerst das gesamte Volume `/data`, nicht nur `snapotter.db`: 1.x nutzt den SQLite-WAL-Modus, sodass ein gestoppter Container einen Großteil seiner Daten oft in `snapotter.db-wal` neben einer fast leeren `snapotter.db` ablegt.
