---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: c55503cb8d0c
---
# Upgrade von 1.x auf 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x speicherte alles in einer einzigen SQLite-Datei und lief als ein einzelner Container. SnapOtter 2.0 verwendet PostgreSQL und Redis. Dieser Leitfaden führt durch die Migration einer 1.x-Installation auf 2.0 ohne Datenverlust.

Die Kurzfassung: Verwende dein bestehendes `/data`-Volume weiter, und 2.0 importiert deine 1.x-Datenbank beim ersten Start automatisch. Deine Benutzer, gespeicherten Dateien, Einstellungen, API-Schlüssel und Pipelines werden übernommen. Die alte Datenbank wird nie verändert, sodass du jederzeit zurückrollen kannst.

::: tip Ein Hinweis für unsere 1.x-Nutzer
Viele von euch vertrauen SnapOtter seit dem ersten Tag, und euer Feedback hat dieses Release geprägt. 2.0 ändert vieles unter der Haube, und dieser Leitfaden sorgt dafür, dass euch der Umstieg nichts kostet, was euch wichtig ist. Eure Konten, Dateien, Einstellungen, API-Schlüssel und Pipelines werden übernommen, und eure alte Datenbank wird nie angerührt. Danke, dass ihr mit uns aktualisiert.
:::

## Bevor du beginnst: sichere das gesamte `/data`-Volume {#before-you-start-back-up-the-whole-data-volume}

Mach das jedes Mal zuerst. Sichere das **gesamte** `/data`-Volume, nicht nur die `snapotter.db`-Datei.

Warum das wichtig ist: 1.x betreibt SQLite im WAL-Modus, sodass ein gestoppter 1.x-Container die meisten seiner festgeschriebenen Daten regelmäßig in `snapotter.db-wal` neben einer nahezu leeren `snapotter.db` liegen lässt. Kopierst du nur `snapotter.db`, erfasst du eine leere Datenbank und verlierst stillschweigend alles. Das Volume trägt `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` und dein `files/`-Verzeichnis gemeinsam, und sie müssen als Einheit wandern.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Zuerst auf 1.17.2 aktualisieren {#upgrade-to-1-17-2-first}

Aktualisiere deine 1.x-Installation auf das neueste 1.x-Release (1.17.2), bevor du auf 2.0 wechselst. So kann 1.x seine eigenen letzten Schemamigrationen ausführen, sodass 2.0 aus einem bekannten, vollständigen Schema importiert. Ein Upgrade von einem älteren 1.x direkt auf 2.0 wird nicht unterstützt.

## Prüfe deinen Volume-Namen {#check-your-volume-name}

Der Importer sieht deine Daten nur, wenn der 2.0-Stack dasselbe Volume mountet, das deine 1.x-Installation verwendet hat. Docker-Volume-Namen unterscheiden Groß- und Kleinschreibung, und ältere README-Snippets verwendeten ein kleingeschriebenes `snapotter-data`, während die Compose-Dateien `SnapOtter-data` verwenden. Bestätige, welches du hast:

```bash
docker volume ls | grep -i snapotter
```

Verwende genau diesen Namen in deiner 2.0-Konfiguration.

## Pfad A: einzelner Container (am schnellsten) {#path-a-single-container-quickest}

Wenn du SnapOtter mit einem einzelnen `docker run` betreibst, mach das weiter so. 2.0 startet ein eingebettetes PostgreSQL und Redis innerhalb des Containers, wenn du `DATABASE_URL` oder `REDIS_URL` nicht setzt, und es erkennt und importiert `/data/snapotter.db` beim ersten Start automatisch.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Achte in den Logs auf eine Zeile wie:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Das ist alles. Melde dich mit deinen bestehenden Zugangsdaten an.

## Pfad B: Compose (empfohlen für die Produktion) {#path-b-compose-recommended-for-production}

Der 2.0-Compose-Stack betreibt drei Dienste (App, Postgres, Redis). Verwende dein 1.x-`/data`-Volume für den App-Dienst weiter. Die App erkennt `/data/snapotter.db` automatisch und importiert es beim ersten Start in Postgres.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Wenn du lieber explizit auf die alte Datenbank zeigen möchtest, setze `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Ein expliziter Pfad hat immer Vorrang vor der automatischen Erkennung.

## Den Import zuerst in der Vorschau ansehen (optional) {#preview-the-import-first-optional}

Um genau zu sehen, was importiert würde, ohne etwas zu schreiben, führe einen Trockenlauf gegen deine Datenbankdatei aus:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Es gibt die Zeilenanzahl pro Tabelle aus, wie viele Dateien der gespeicherten Bibliothek es auf der Festplatte gefunden hat und welche Job-Status es normalisieren wird. Es benötigt kein laufendes Postgres.

## Was übernommen wird und was nicht {#what-carries-over-and-what-does-not}

Übernommen:

- Benutzer und die Möglichkeit, sich anzumelden. Passwort-Hashes bleiben unverändert, sodass derselbe Benutzername und dasselbe Passwort funktionieren.
- Teams, Einstellungen (einschließlich deiner Instanz-Identität), Rollen, API-Schlüssel (sie funktionieren weiter) und gespeicherte Pipelines.
- Job-Verlaufsdatensätze.
- Deine gespeicherte Dateibibliothek, sowohl die Datensätze als auch die tatsächlichen Dateien, denn `/data/files` bleibt auf dem Volume erhalten.

Nicht übernommen:

- Anmeldesitzungen. Alle melden sich nach dem Upgrade einmal neu an. Die Zugangsdaten bleiben unverändert, es ist also eine einmalige erneute Anmeldung, mehr nicht.
- Die Eingabe- und Ausgabedateien alter Verarbeitungs-Jobs. Diese lagen in einem temporären Arbeitsbereich und sind bewusst weg. Die Job-Verlaufsdatensätze bleiben erhalten.
- Analyse-Einwilligungs-Flags pro Benutzer aus 1.x, die in 2.0 kein Äquivalent haben (die Analyse in 2.0 ist eine instanzweite Einstellung).

## Den Import ausschalten {#turning-the-import-off}

Wenn du bewusst eine frische Datenbank willst, obwohl eine `snapotter.db` auf dem Volume vorhanden ist, setze `SQLITE_MIGRATE_PATH=off`.

## Wenn du bereits Daten in der 2.0-Instanz hast {#if-you-already-have-data-in-the-2-0-instance}

Der Importer läuft nur bei einer leeren Datenbank an. Wenn du 2.0 frisch gestartet hast (und Daten erzeugt hast) und danach ein altes `snapotter.db` gemountet hast, erkennt 2.0 es, importiert aber nicht, weil das Zusammenführen zweier Datensätze bei IDs kollidieren kann. Du siehst eine Warnung in den Logs. Um die 1.x-Daten zu importieren, brauchst du eine leere Instanz:

- Wenn die 2.0-Instanz nur den Standard-Administrator enthält (du sie also nicht wirklich genutzt hast), stoppe den Stack, entferne das Postgres-Volume (`SnapOtter-pgdata`) und starte erneut mit vorhandener alter `/data`. Es wird sauber importiert. Dies löscht nur die wegwerfbaren Postgres-Daten, nicht deine 1.x-Datenbank.
- Wenn die 2.0-Instanz echte Daten enthält, die du behalten möchtest, können die beiden Datensätze nicht automatisch zusammengeführt werden. Exportiere, was du brauchst, und importiere die 1.x-Daten in ein separates, frisches Deployment.

## Zurückrollen {#rolling-back}

Das Upgrade verändert oder löscht deine 1.x-`snapotter.db` nie. Wenn du zu 1.x zurückkehren musst, deploye das 1.x-Image erneut gegen dasselbe Volume. Alles, was du nach dem Upgrade in 2.0 erstellt hast, liegt in Postgres und wäre nicht in der 1.x-Datenbank, also rolle zeitnah zurück, wenn du es vorhast.
