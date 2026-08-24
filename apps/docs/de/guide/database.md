---
description: "PostgreSQL-Datenbankschema, Tabellen, Migrationen und Backup-Verfahren für SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 37efb265dd4b
i18n_hash_version: 2
---

# Datenbank {#database}

SnapOtter verwendet PostgreSQL 17 mit [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) für die Datenpersistenz. Das Schema ist in `apps/api/src/db/schema.ts` definiert.

Die Verbindung wird über die Umgebungsvariable `DATABASE_URL` konfiguriert (Standard `postgres://snapotter:snapotter@postgres:5432/snapotter`). In Docker Compose speichert der Postgres-Container seine Daten im benannten Volume `SnapOtter-pgdata`. Anfragen werden über eine Rolle bedient, die ausschließlich Zeilen lesen und schreiben kann; Näheres dazu weiter unten unter [Rollen mit minimalen Rechten](#least-privilege-roles).

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

## Rollen mit minimalen Rechten {#least-privilege-roles}

Zwei Rollen, zwei Aufgaben. `DATABASE_URL` bedient Anfragen und besitzt `SELECT`, `INSERT`, `UPDATE`, `DELETE` auf den Tabellen der App sowie `USAGE` und `SELECT` auf deren Sequenzen. Mehr ist es nicht. Sie kann keine Tabelle anlegen oder löschen, keine Erweiterung installieren, kein `TRUNCATE` ausführen, `pg_authid` nicht lesen, keine Datenbank anlegen, keine Rolle ändern und das Schema `drizzle`, in dem die Migrationshistorie liegt, nicht anfassen.

`DATABASE_MIGRATION_URL` ist die privilegierte Verbindung. Sie führt beim Start die Migrationen aus und vergibt die Rechte an die Laufzeitrolle, danach wird sie geschlossen, bevor die erste Anfrage bedient wird.

Compose und das All-in-One-Image sind bereits so verdrahtet, bestehende Installationen eingeschlossen. Beim Start legt SnapOtter die Laufzeitrolle an, falls sie fehlt, vergibt die Rechte, migriert und zieht die Rechte anschließend über die Tabellen nach, die schon vorher da waren. Für ein Upgrade ist kein manuelles SQL nötig.

Bleibt `DATABASE_MIGRATION_URL` leer, läuft SnapOtter mit einer einzigen Rolle, und `DATABASE_URL` übernimmt beide Aufgaben genau wie vor der Trennung. Das ist eine unterstützte Konfiguration und keine veraltete. Bei verwaltetem Postgres ist sie oft die richtige Wahl, denn dort liegt das Anlegen von Rollen häufig nicht in Ihrer Hand.

### Externes und verwaltetes Postgres {#external-and-managed-postgres}

Bei RDS, Supabase, Cloud SQL oder einem selbst betriebenen Cluster ist die Trennung optional. Legen Sie die Laufzeitrolle einmalig an:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Übergeben Sie SnapOtter anschließend beide Verbindungszeichenfolgen, die auf denselben Host, denselben Port und dieselbe Datenbank zeigen:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Mehr ist nicht nötig. SnapOtter vergibt die Rechte selbst und erneuert sie nach jeder Migration, sodass eine Tabelle aus einem künftigen Release abgedeckt ist, ohne dass jemand dafür SQL ausführt.

Die Rolle in `DATABASE_MIGRATION_URL` muss Eigentümerin der SnapOtter-Tabellen sein, denn nur der Eigentümer einer Tabelle kann Rechte darauf vergeben. Bei einer bestehenden Installation ist das die Rolle, unter der SnapOtter bisher lief, und keine eigens dafür angelegte. Zeigt der Eintrag auf eine neue Rolle, der nichts gehört, schlägt der Start mit genau dieser Fehlermeldung fehl. Zusätzlich braucht die Rolle `CREATEROLE`, um die Laufzeitrolle anzulegen und zu pflegen, sowie das Recht, das Schema `drizzle` zu erstellen.

Steht in beiden URLs dieselbe Rolle, ist die Trennung aufgehoben, und SnapOtter schreibt das ins Log, statt etwas anderes vorzugeben. Bietet Ihr Anbieter keine Rolle, die zugleich die Tabellen besitzt und `CREATEROLE` hat, betreiben Sie SnapOtter mit einer einzigen Rolle.

### Warum das Superuser-Bit unangetastet bleibt {#why-the-superuser-bit-is-left-alone}

SnapOtter entzieht einer Rolle niemals von sich aus `SUPERUSER`. Bei einer Installation, die vor der Trennung entstanden ist, ist `snapotter` der einzige Superuser des Clusters, und eine Herabstufung ließe das Cluster ohne einen solchen zurück, wiederherstellbar nur über den Single-User-Modus bei gestopptem Server. Den Schutz bringt stattdessen die Verlagerung der langlebigen Verbindung auf die eingeschränkte Rolle. Der Superuser ist nur für die wenigen Sekunden des Starts auf der Leitung und danach weg.

Neue All-in-One-Installationen haben dieses Problem nie. Sie bekommen drei Rollen: `postgres` (Bootstrap-Superuser, in keiner von SnapOtter genutzten Verbindungszeichenfolge enthalten), `snapotter` (`NOSUPERUSER`, Eigentümerin der Daten, verbindet sich nur beim Start) und `snapotter_app` (nur Zeilen, bedient Anfragen).

Wer ein älteres `snapotter` dennoch herabstufen möchte, legt zuerst einen zweiten Superuser an und meldet sich damit an, um zu prüfen, dass er funktioniert. Danach `ALTER ROLE snapotter NOSUPERUSER`.

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

Beide Befehle verbinden sich als `snapotter`, also als Eigentümer, und sollten das auch weiterhin tun. Die Laufzeitrolle sieht das Schema `drizzle` nicht, ein als diese Rolle erstellter Dump wäre also unvollständig. `--no-owner` überlässt die wiederhergestellten Objekte demjenigen, der die Wiederherstellung ausführt; als Eigentümer ausgeführt landet die Eigentümerschaft damit dort, wo die Rechte sie erwarten. Ein Haken bei einem frischen Cluster: `pg_dump` überträgt zwar die Rechte, nicht aber die darin genannten Rollen. Legen Sie `snapotter_app` deshalb vor der Wiederherstellung an, sonst bricht `--exit-on-error` beim ersten `GRANT` ab. Die Rechte vergibt SnapOtter beim nächsten Start ohnehin erneut.

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
