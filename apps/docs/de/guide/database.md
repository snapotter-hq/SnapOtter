---
description: "PostgreSQL-Datenbankschema, Tabellen, Migrationen und Backup-Verfahren für SnapOtter."
i18n_source_hash: b37398ae91a3
i18n_provenance: human
i18n_output_hash: dd3579a83805
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

Persistente Dateibibliothek mit Nachverfolgung der Versionskette. Jeder Verarbeitungsschritt, der ein Ergebnis speichert, erstellt eine neue Zeile, die über `parentId` mit ihrem übergeordneten Element verknüpft ist und so einen Versionsbaum bildet.

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

## Migrationen {#migrations}

Drizzle übernimmt die Schema-Migrationen. Die Migrationsdateien liegen in `apps/api/drizzle/`. Während der Entwicklung:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

In der Produktion werden ausstehende Migrationen beim Start automatisch angewendet.

## Backup und Wiederherstellung {#backup-and-restore}

Die relationale Datenbank liegt im Volume `SnapOtter-pgdata` des Postgres-Containers, nicht im Volume `/data` der App.

**Option 1: pg_dump (empfohlen)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Option 2: Volume-Snapshot**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Migration von 1.x (SQLite) {#migrating-from-1-x-sqlite}

Das Upgrade von SnapOtter 1.x hat einen eigenen Leitfaden: siehe [Upgrade von 1.x auf 2.0](./upgrading). Kurz gesagt: Verwende dein bestehendes Volume `/data` weiter, und 2.0 erkennt und importiert `/data/snapotter.db` beim ersten Start automatisch (oder setze `SQLITE_MIGRATE_PATH`, um explizit darauf zu verweisen). Sichere zuerst das gesamte Volume `/data`, nicht nur `snapotter.db`: 1.x nutzt den SQLite-WAL-Modus, sodass ein gestoppter Container einen Großteil seiner Daten oft in `snapotter.db-wal` neben einer fast leeren `snapotter.db` ablegt.
