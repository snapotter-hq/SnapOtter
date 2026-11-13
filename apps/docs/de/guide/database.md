---
description: "PostgreSQL-Datenbankschema, Tabellen, Migrationen und Backup-Verfahren für SnapOtter."
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 3d541b502f2e
i18n_hash_version: 2
---

# Datenbank {#database}

SnapOtter verwendet PostgreSQL 17 mit [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) zur Datenspeicherung. Das Schema ist in `apps/api/src/db/schema.ts` definiert.

Die Verbindung wird über die Umgebungsvariable `DATABASE_URL` konfiguriert (Standard `postgres://snapotter:snapotter@postgres:5432/snapotter`). In Docker Compose speichert der Postgres-Container seine Daten im benannten Volume `SnapOtter-pgdata`. Anfragen werden über eine Rolle bedient, die nur Zeilen lesen und schreiben darf, was weiter unten unter [Rollen mit minimalen Rechten](#least-privilege-roles) beschrieben ist.

## Tabellen {#tables}

### users {#users}

Speichert Benutzerkonten. Wird beim ersten Start automatisch aus `DEFAULT_USERNAME` und `DEFAULT_PASSWORD` erstellt.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | uuid | Primärschlüssel |
| `username` | varchar | Eindeutig, erforderlich |
| `passwordHash` | varchar | scrypt-Hash |
| `role` | varchar | `admin`, `editor` oder `user` |
| `mustChangePassword` | boolean | Kennzeichen für erzwungenes Zurücksetzen des Passworts |
| `createdAt` | timestamp | Erstellungszeitpunkt |
| `updatedAt` | timestamp | Zeitpunkt der letzten Aktualisierung |

### sessions {#sessions}

Aktive Anmeldesitzungen. Jede Zeile verknüpft ein Sitzungstoken mit einem Benutzer.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | varchar | Primärschlüssel (Sitzungstoken) |
| `userId` | uuid | Fremdschlüssel auf `users.id` |
| `expiresAt` | timestamp | Ablaufzeitpunkt |
| `createdAt` | timestamp | Erstellungszeitpunkt |

### teams {#teams}

Gruppen zur Organisation von Benutzern. Administratoren können Benutzer Teams zuweisen.

| Spalte | Typ | Beschreibung |
|--------|------|-------------|
| `id` | uuid | Primärschlüssel |
| `name` | varchar (eindeutig, max. 50 Zeichen) | Teamname |
| `createdAt` | timestamp | Erstellungszeitpunkt |

### api_keys {#api-keys}

API-Schlüssel für den programmatischen Zugriff. Der Rohschlüssel wird einmalig bei der Erstellung angezeigt; gespeichert wird nur der Hash.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | uuid | Primärschlüssel |
| `userId` | uuid | Fremdschlüssel auf `users.id` |
| `keyHash` | varchar | scrypt-Hash des Schlüssels |
| `name` | varchar | Vom Benutzer vergebene Bezeichnung |
| `createdAt` | timestamp | Erstellungszeitpunkt |
| `lastUsedAt` | timestamp | Wird bei jeder authentifizierten Anfrage aktualisiert |

Schlüssel beginnen mit dem Präfix `si_`, gefolgt von 96 Hexadezimalzeichen (48 zufällige Bytes).

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

Dauerhafte Dateibibliothek. Eine gespeicherte Bearbeitung wird standardmäßig als eigenständige Wurzelzeile eingefügt ("Als neu speichern": `version` 1, `parentId` null, sodass das Original weiterhin aufgelistet bleibt) oder als mit dem Elternobjekt verknüpfte Version, wenn Sie das Original überschreiben (`parentId` gesetzt, `version` erhöht, wodurch es abgelöst wird). Die Spalte `toolChain` hält die angewendeten Tools fest.

| Spalte | Typ | Beschreibung |
|--------|------|-------------|
| `id` | uuid | Primärschlüssel |
| `userId` | uuid | FK auf users (CASCADE DELETE) |
| `originalName` | varchar | Ursprünglicher Dateiname beim Upload |
| `storedName` | varchar | Dateiname auf dem Datenträger |
| `mimeType` | varchar | MIME-Typ |
| `size` | integer | Dateigröße in Bytes |
| `width` | integer | Bildbreite in px |
| `height` | integer | Bildhöhe in px |
| `version` | integer | Versionsnummer (1 = Original) |
| `parentId` | uuid oder null | FK auf user_files (Elternversion) |
| `toolChain` | jsonb | Tool-IDs, die der Reihe nach angewendet wurden, um diese Version zu erzeugen |
| `createdAt` | timestamp | Erstellungszeitpunkt |

### jobs {#jobs}

Verfolgt Verarbeitungsjobs für Fortschrittsmeldungen und Bereinigung.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | uuid | Primärschlüssel |
| `type` | varchar | Tool- oder Pipeline-Kennung |
| `status` | varchar | `queued`, `processing`, `completed` oder `failed` |
| `progress` | real | Bruchteil von 0.0 bis 1.0 |
| `inputFiles` | jsonb | Array der Eingabedateipfade |
| `outputPath` | varchar | Pfad zur Ergebnisdatei |
| `settings` | jsonb | Verwendete Tool-Einstellungen |
| `error` | varchar | Fehlermeldung bei Fehlschlag |
| `createdAt` | timestamp | Erstellungszeitpunkt |
| `completedAt` | timestamp | Abschlusszeitpunkt |

### settings {#settings}

Schlüssel-Wert-Speicher für serverweite Einstellungen, die Administratoren in der Oberfläche ändern können.

| Spalte | Typ | Hinweise |
|---|---|---|
| `key` | varchar | Primärschlüssel |
| `value` | varchar | Einstellungswert |
| `updatedAt` | timestamp | Zeitpunkt der letzten Aktualisierung |

### roles {#roles}

Benutzerdefinierte Rollen mit fein abgestuften Berechtigungen.

| Spalte | Typ | Hinweise |
|---|---|---|
| `id` | uuid | Primärschlüssel |
| `name` | varchar | Eindeutiger Rollenname |
| `description` | varchar | Optionale Beschreibung |
| `permissions` | jsonb | Array von Berechtigungszeichenfolgen |
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

Oberflächenstatus pro Benutzer, nach Präferenzname geschlüsselt. Bildet die angehefteten Tools des Dashboards über `PUT /api/v1/preferences` ab.

| Spalte | Typ | Hinweise |
|---|---|---|
| `userId` | text | FK auf users, wird beim Löschen kaskadiert. Primärschlüssel zusammen mit `key` |
| `key` | text | Name der Präferenz. Primärschlüssel zusammen mit `userId` |
| `value` | jsonb | Nutzdaten der Präferenz |
| `updatedAt` | timestamp | Letzter Schreibzugriff |

## Migrationen {#migrations}

Drizzle übernimmt die Schemamigrationen. Die Migrationsdateien liegen in `apps/api/drizzle/`. Während der Entwicklung:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

In der Produktion werden ausstehende Migrationen beim Start automatisch angewendet.

## Rollen mit minimalen Rechten {#least-privilege-roles}

Zwei Rollen, zwei Aufgaben. `DATABASE_URL` bedient Anfragen und besitzt `SELECT`, `INSERT`, `UPDATE`, `DELETE` auf den Tabellen der App sowie `USAGE` und `SELECT` auf deren Sequenzen. Das ist die vollständige Liste. Die Rolle kann keine Tabelle erstellen oder löschen, keine Erweiterung installieren, `TRUNCATE`, `pg_authid` lesen, keine Datenbank erstellen, keine Rolle ändern und nicht auf das Schema `drizzle` zugreifen, in dem der Migrationsverlauf liegt.

`DATABASE_MIGRATION_URL` ist die privilegierte Rolle. Sie führt Migrationen aus und erteilt der Laufzeitrolle beim Start ihre Rechte, und wird geschlossen, bevor eine einzige Anfrage bedient wird.

Die Aufteilung wird mit SnapOtter 2.3.0 ausgeliefert. Ab dieser Version sind die Compose-Dateien im Repository und das All-in-one-Image so verdrahtet, auch bei bestehenden Installationen: Beim Start erstellt SnapOtter die Laufzeitrolle, falls sie fehlt, erteilt ihr Rechte, migriert und überträgt die Rechte dann auf Tabellen, die bereits vorher existierten. Für ein Upgrade ist kein manuelles SQL nötig.

Das Image 2.2.0 liest nur die Laufzeit-Verbindungszeichenfolge und erstellt die zweite Rolle nie. Übergeben Sie ihm die Aufteilung, startet es daher nicht: Das App-Protokoll zeigt eine fehlgeschlagene Passwortauthentifizierung für diese Rolle, und das Postgres-Protokoll meldet, dass die Rolle nicht existiert. Aktualisieren Sie das Image auf 2.3.0 oder höher, bevor Sie eine Compose-Datei auf die Aufteilung umstellen.

Wenn Sie `DATABASE_MIGRATION_URL` leer lassen, läuft SnapOtter mit einer einzigen Rolle, wobei `DATABASE_URL` beide Aufgaben genau so übernimmt wie vor der Aufteilung. Das ist eine unterstützte Konfiguration und keine veraltete. Bei verwaltetem Postgres, wo das Erstellen von Rollen oft nicht in Ihrer Hand liegt, ist sie die richtige Wahl.

### Externes und verwaltetes Postgres {#external-and-managed-postgres}

Bei RDS, Supabase, Cloud SQL oder jedem Cluster, den Sie selbst betreiben, ist die Aufteilung optional. Erstellen Sie die Laufzeitrolle einmalig:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Übergeben Sie SnapOtter dann beide Verbindungszeichenfolgen, die auf denselben Host, Port und dieselbe Datenbank zeigen:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Mehr ist nicht nötig. SnapOtter wendet die Rechte selbst an und wendet sie nach jeder Migration erneut an, sodass eine von einer künftigen Version hinzugefügte Tabelle abgedeckt ist, ohne dass jemand dafür SQL ausführen muss.

Die Rolle in `DATABASE_MIGRATION_URL` muss die SnapOtter-Tabellen besitzen, denn nur der Eigentümer einer Tabelle kann darauf Rechte erteilen. Bei einer bestehenden Installation ist das die Rolle, unter der Sie SnapOtter bisher betrieben haben, keine eigens dafür neu angelegte. Verweisen Sie auf eine neue Rolle, der nichts gehört, schlägt der Start mit einem Fehler fehl, der genau das aussagt. Sie benötigt außerdem `CREATEROLE`, um die Laufzeitrolle zu erstellen und zu pflegen, sowie das Recht, das Schema `drizzle` zu erstellen.

Nennen Sie in beiden URLs dieselbe Rolle, ist die Aufteilung aus, und SnapOtter teilt das im Protokoll mit, statt etwas anderes vorzutäuschen. Wenn Ihr Anbieter Ihnen keine Rolle gibt, die sowohl die Tabellen besitzen als auch `CREATEROLE` halten kann, betreiben Sie eine einzige Rolle.

### Warum das Superuser-Bit unangetastet bleibt {#why-the-superuser-bit-is-left-alone}

SnapOtter entzieht einer Rolle nie von sich aus `SUPERUSER`. Bei einer vor der Aufteilung erstellten Installation ist `snapotter` der einzige Superuser des Clusters, und ihn herabzustufen, ließe den Cluster ohne einen zurück, wiederherstellbar nur über den Einzelbenutzermodus bei gestopptem Server. Den Schutz bringt stattdessen das Verlegen der langlebigen Verbindung auf die eingeschränkte Rolle. Der Superuser ist nur für die wenigen Sekunden des Starts im Spiel und dann weg.

Frische All-in-one-Installationen haben dieses Problem nie. Sie erhalten drei Rollen: `postgres` (Bootstrap-Superuser, in keiner von SnapOtter verwendeten Verbindungszeichenfolge enthalten), `snapotter` (`NOSUPERUSER`, besitzt die Daten, verbindet sich nur beim Start) und `snapotter_app` (nur Zeilen, bedient Anfragen).

Um einen älteren `snapotter` trotzdem herabzustufen, erstellen Sie zuerst einen zweiten Superuser und melden Sie sich mit ihm an, um zu bestätigen, dass er funktioniert. Danach `ALTER ROLE snapotter NOSUPERUSER`.

## Sicherung und Wiederherstellung {#backup-and-restore}

Die relationale Datenbank liegt im Volume `SnapOtter-pgdata` des Postgres-Containers, nicht im Volume `/data` der App.

**Logisches Backup mit Validierung (empfohlen)**

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

Beide Befehle verbinden sich als `snapotter`, den Eigentümer, und sollten das weiterhin tun. Die Laufzeitrolle kann das Schema `drizzle` nicht sehen, daher würde ein mit dieser Rolle erstellter Dump unvollständig ausfallen. `--no-owner` lässt wiederhergestellte Objekte demjenigen gehören, der die Wiederherstellung ausführt, daher bringt die Ausführung als Eigentümer die Besitzverhältnisse dorthin, wo die Rechte sie erwarten. Ein Haken bei einem frischen Cluster: `pg_dump` enthält die Rechte, aber nicht die Rollen, die sie nennen. Erstellen Sie daher `snapotter_app` vor der Wiederherstellung, sonst bricht `--exit-on-error` beim ersten `GRANT` ab. SnapOtter wendet die Rechte beim nächsten Start ohnehin erneut an.

Dieser Datenbank-Dump enthält weder gespeicherte Bibliotheksobjekte in `/data/files` noch den dauerhaften BullMQ-Zustand in Redis. Sichern und stellen Sie diese mit dem koordinierten Verfahren in [Sicherheit und Härtung](/de/guide/security#backup-and-recovery) wieder her.

**Kalter Volume-Snapshot**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Kopieren Sie ein laufendes PostgreSQL-Datenverzeichnis nicht mit `tar`. Compose stellt Volume-Namen den Projektnamen voran. Ermitteln Sie die IDs der eingebundenen Volumes daher aus `docker inspect` oder Ihrer Speicherplattform, statt die wörtliche Bezeichnung `SnapOtter-pgdata` anzunehmen.

### Migration von 1.x (SQLite) {#migrating-from-1-x-sqlite}

Das Upgrade von SnapOtter 1.x hat eine eigene Anleitung: siehe [Upgrade von 1.x auf 2.0](./upgrading). Kurz gesagt: Verwenden Sie Ihr bestehendes Volume `/data` weiter, dann erkennt 2.0 die Datei `/data/snapotter.db` beim ersten Start automatisch und importiert sie (oder setzen Sie `SQLITE_MIGRATE_PATH`, um ausdrücklich darauf zu verweisen). Sichern Sie zuerst das gesamte Volume `/data`, nicht nur `snapotter.db`: 1.x nutzt den SQLite-WAL-Modus, daher liegt bei einem gestoppten Container oft der größte Teil seiner Daten in `snapotter.db-wal` neben einer fast leeren `snapotter.db`.