---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 55d912e0541b
i18n_hash_version: 2
---
# Upgrade von 1.x auf 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x speicherte alles in einer einzelnen SQLite-Datei und lief als ein Container. SnapOtter 2.0 verwendet PostgreSQL und Redis. Diese Anleitung führt Sie durch die Umstellung einer 1.x-Installation auf 2.0, ohne Daten zu verlieren.

Die Kurzfassung: Verwenden Sie Ihr bestehendes Volume `/data` weiter, und 2.0 importiert Ihre 1.x-Datenbank beim ersten Start automatisch. Ihre Benutzer, gespeicherten Dateien, Einstellungen, API-Schlüssel und Pipelines werden übernommen. Die alte Datenbank wird nie verändert, sodass Sie jederzeit zurückwechseln können.

::: tip Ein Hinweis für unsere 1.x-Benutzer
Viele von Ihnen vertrauen SnapOtter seit dem ersten Tag, und Ihr Feedback hat dieses Release geprägt. 2.0 ändert vieles unter der Haube, und diese Anleitung soll sicherstellen, dass der Umstieg Sie nichts kostet, was Ihnen wichtig ist. Ihre Konten, Dateien, Einstellungen, API-Schlüssel und Pipelines werden übernommen, und Ihre alte Datenbank wird nie angerührt. Danke, dass Sie mit uns umsteigen.
:::

## Bevor Sie beginnen: Sichern Sie das gesamte Volume `/data` {#before-you-start-back-up-the-whole-data-volume}

Tun Sie das zuerst, jedes Mal. Sichern Sie das **gesamte** Volume `/data`, nicht nur die Datei `snapotter.db`.

Das ist der Grund: 1.x betreibt SQLite im WAL-Modus, sodass ein angehaltener 1.x-Container regelmäßig den Großteil seiner committeten Daten in `snapotter.db-wal` neben einer fast leeren `snapotter.db` zurücklässt. Wenn Sie nur `snapotter.db` kopieren, erfassen Sie eine leere Datenbank und verlieren stillschweigend alles. Das Volume enthält `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` und Ihr Verzeichnis `files/` gemeinsam, und sie müssen als Satz zusammenbleiben.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Zuerst auf 1.17.2 aktualisieren {#upgrade-to-1-17-2-first}

Aktualisieren Sie Ihre 1.x-Installation auf das neueste 1.x-Release (1.17.2), bevor Sie auf 2.0 umsteigen. So kann 1.x seine eigenen abschließenden Schemamigrationen ausführen, und 2.0 importiert aus einem bekannten, vollständigen Schema. Ein Upgrade von einer älteren 1.x-Version direkt auf 2.0 wird nicht unterstützt.

## Volume-Namen prüfen {#check-your-volume-name}

Der Importer sieht Ihre Daten nur, wenn der 2.0-Stack dasselbe Volume einbindet, das Ihre 1.x-Installation verwendet hat. Docker-Volume-Namen unterscheiden Groß- und Kleinschreibung, und ältere README-Snippets verwendeten ein kleingeschriebenes `snapotter-data`, während die Compose-Dateien `SnapOtter-data` verwenden. Prüfen Sie, welches Sie haben:

```bash
docker volume ls | grep -i snapotter
```

Verwenden Sie genau diesen Namen in Ihrer 2.0-Konfiguration.

## Weg A: einzelner Container (am schnellsten) {#path-a-single-container-quickest}

Wenn Sie SnapOtter mit einem einzelnen `docker run` betreiben, behalten Sie das bei. 2.0 startet ein eingebettetes PostgreSQL und Redis im Container, wenn Sie `DATABASE_URL` oder `REDIS_URL` nicht setzen, und erkennt `/data/snapotter.db` beim ersten Start automatisch und importiert sie.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Achten Sie in den Logs auf eine Zeile wie:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Das war es schon. Melden Sie sich mit Ihren bestehenden Zugangsdaten an.

## Weg B: Compose (empfohlen für die Produktion) {#path-b-compose-recommended-for-production}

Der 2.0-Compose-Stack führt drei Dienste aus (App, Postgres, Redis). Verwenden Sie Ihr 1.x-Volume `/data` für den App-Dienst weiter. Die App erkennt `/data/snapotter.db` automatisch und importiert sie beim ersten Start nach Postgres.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Wenn Sie lieber ausdrücklich auf die alte Datenbank verweisen möchten, setzen Sie `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Ein expliziter Pfad hat immer Vorrang vor der automatischen Erkennung.

## Import vorab prüfen (optional) {#preview-the-import-first-optional}

Um genau zu sehen, was importiert würde, ohne etwas zu schreiben, führen Sie einen Testlauf gegen Ihre Datenbankdatei aus:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Er gibt die Zeilenzahlen pro Tabelle aus, wie viele Dateien der gespeicherten Bibliothek er auf der Festplatte gefunden hat und welche Auftragsstatus er normalisieren wird. Es wird kein laufendes Postgres benötigt.

## Was übernommen wird und was nicht {#what-carries-over-and-what-does-not}

Übernommen werden:

- Benutzer und die Möglichkeit, sich anzumelden. Passwort-Hashes bleiben unverändert, sodass derselbe Benutzername und dasselbe Passwort funktionieren.
- Teams, Einstellungen (einschließlich Ihrer Instanzidentität), Rollen, API-Schlüssel (sie funktionieren weiter) und gespeicherte Pipelines.
- Einträge des Auftragsverlaufs.
- Ihre gespeicherte Dateibibliothek, sowohl die Einträge als auch die eigentlichen Dateien, weil `/data/files` auf dem Volume erhalten bleibt.

Nicht übernommen werden:

- Anmeldesitzungen. Alle melden sich nach dem Upgrade einmal neu an. Die Zugangsdaten bleiben unverändert, es ist also eine einzige erneute Anmeldung, nicht mehr.
- Die Eingabe- und Ausgabedateien alter Verarbeitungsaufträge. Diese lagen in einem temporären Arbeitsbereich und sind absichtlich weg. Die Einträge des Auftragsverlaufs bleiben erhalten.
- Benutzerbezogene Analyse-Einwilligungsmarkierungen aus 1.x, für die es in 2.0 keine Entsprechung gibt (die Analysen in 2.0 sind eine Einstellung auf Instanzebene).

## Den Import ausschalten {#turning-the-import-off}

Wenn Sie bewusst eine frische Datenbank möchten, obwohl auf dem Volume eine `snapotter.db` vorhanden ist, setzen Sie `SQLITE_MIGRATE_PATH=off`.

## Wenn Sie bereits Daten in der 2.0-Instanz haben {#if-you-already-have-data-in-the-2-0-instance}

Der Importer läuft nur in eine leere Datenbank. Wenn Sie 2.0 neu gestartet haben (und Daten erzeugt haben) und später eine alte `snapotter.db` eingebunden haben, erkennt 2.0 sie, importiert aber nicht, weil das Zusammenführen zweier Datensätze zu ID-Konflikten führen kann. Sie sehen eine Warnung in den Logs. Um die 1.x-Daten zu importieren, benötigen Sie eine leere Instanz:

- Wenn die 2.0-Instanz nur den Standard-Administrator enthält (Sie haben sie nicht wirklich benutzt), stoppen Sie den Stack, entfernen Sie das Postgres-Volume (`SnapOtter-pgdata`) und starten Sie erneut mit der vorhandenen alten `/data`. Sie wird sauber importiert. Dadurch werden nur die Wegwerf-Daten von Postgres gelöscht, nicht Ihre 1.x-Datenbank.
- Wenn die 2.0-Instanz echte Daten enthält, die Sie behalten möchten, lassen sich die beiden Datensätze nicht automatisch zusammenführen. Exportieren Sie, was Sie brauchen, und importieren Sie die 1.x-Daten in eine separate frische Bereitstellung.

## Zurückwechseln {#rolling-back}

Das Upgrade verändert oder löscht Ihre 1.x-`snapotter.db` nie. Wenn Sie zu 1.x zurückkehren müssen, stellen Sie das 1.x-Image mit demselben Volume neu bereit. Alles, was Sie nach dem Upgrade in 2.0 erstellt haben, liegt in Postgres und wäre nicht in der 1.x-Datenbank, wechseln Sie also zügig zurück, wenn Sie das vorhaben.