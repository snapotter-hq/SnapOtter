---
description: "Monorepo-Struktur, App- und Paketarchitektur, Request-Lebenszyklus und Ressourcen-Footprint von SnapOtter."
i18n_source_hash: 9e8f80499a37
i18n_provenance: human
i18n_output_hash: af8ecb20c86e
---

# Architektur {#architecture}

SnapOtter ist ein Monorepo, das mit pnpm-Workspaces und Turborepo verwaltet wird. Es wird als 3-Container-Docker-Compose-Stack ausgeliefert: das SnapOtter-App-Image, PostgreSQL 17 und Redis 8.

## Projektstruktur {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## Pakete {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

Die zentrale Bildverarbeitungsbibliothek, aufgebaut auf [Sharp](https://sharp.pixelplumbing.com/). Sie übernimmt alle Nicht-KI-Operationen: Skalieren, Zuschneiden, Drehen, Spiegeln, Konvertieren, Komprimieren, Metadaten entfernen und Farbanpassungen (Helligkeit, Kontrast, Sättigung, Graustufen, Sepia, Invertieren, Farbkanäle).

Dieses Paket hat keine Netzwerkabhängigkeiten und läuft vollständig im Prozess.

### `@snapotter/ai` {#snapotter-ai}

Eine Brückenschicht, die Python-Skripte für ML-Operationen aufruft. Bei der ersten Verwendung startet die Brücke einen persistenten Python-Dispatcher-Prozess, der schwere Bibliotheken (PIL, NumPy, MediaPipe, rembg) vorab importiert, sodass nachfolgende KI-Aufrufe den Import-Overhead überspringen. Ist der Dispatcher noch nicht bereit, weicht die Brücke darauf aus, pro Anfrage einen frischen Python-Subprozess zu starten.

**Modelle werden nicht vorgeladen.** Jedes Werkzeug-Skript lädt seine Modellgewichte zur Anfragezeit von der Festplatte und verwirft sie, sobald die Anfrage abgeschlossen ist. Siehe [Ressourcen-Footprint](#resource-footprint) für das vollständige Speicherprofil.

Unterstützte Operationen: Hintergrundentfernung (rembg/BiRefNet), Hochskalierung (RealESRGAN), Gesichtsunschärfe (MediaPipe), Gesichtsverbesserung (GFPGAN/CodeFormer), Objektradierung (LaMa ONNX), OCR (PaddleOCR/Tesseract), Kolorierung (DDColor), Rauschentfernung, Rote-Augen-Entfernung, Fotorestaurierung, Passfoto-Erzeugung, Transparenzkorrektur (BiRefNet-HR-Matting) und inhaltsbewusstes Skalieren (Go-caire-Binärdatei).

Die Python-Skripte liegen in `packages/ai/python/`. Das Docker-Image lädt alle Modellgewichte während des Builds vorab herunter, sodass der Container vollständig offline funktioniert.

### `@snapotter/shared` {#snapotter-shared}

Gemeinsam genutzte TypeScript-Typen, Konstanten (wie `APP_VERSION` und Werkzeugdefinitionen) und i18n-Übersetzungsstrings, die sowohl vom Frontend als auch vom Backend verwendet werden.

## Anwendungen {#applications}

### API (`apps/api`) {#api-apps-api}

Ein Fastify-v5-Server, der 241 Werkzeug-Routen über fünf Modalitäten (image, video, audio, PDF, file) bereitstellt und Folgendes übernimmt:
- Datei-Uploads, Verwaltung des temporären Arbeitsbereichs und persistenter Dateispeicher
- Benutzer-Dateibibliothek mit Versionsketten (`user_files`-Tabelle) - jedes verarbeitete Ergebnis verweist zurück auf seine Quelldatei und erfasst, welches Werkzeug angewendet wurde, mit automatisch generierten Thumbnails für die Files-Seite
- Werkzeugausführung (leitet jede Werkzeuganfrage an die Image-Engine oder die KI-Brücke weiter)
- Pipeline-Orchestrierung (das sequenzielle Verketten mehrerer Werkzeuge)
- Stapelverarbeitung mit Nebenläufigkeitssteuerung über BullMQ-Job-Warteschlangen (Pools: image, media, ai, docs, system)
- Benutzerauthentifizierung, RBAC (admin-/user-Rollen mit einem vollständigen Berechtigungssatz), API-Schlüsselverwaltung und Ratenbegrenzung
- Teamverwaltung - Admin-only-CRUD; Benutzer werden über das Feld `team` in ihrem Profil einem Team zugewiesen
- Laufzeiteinstellungen - ein Schlüssel-Wert-Speicher in der `settings`-Tabelle, der `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit` und andere betriebliche Stellschrauben ohne erneutes Deployment steuert
- Benutzerdefiniertes Branding und Laufzeiteinstellungen über datenbankgestützte Settings
- Scalar-/OpenAPI-Dokumentation unter `/api/docs`
- Auslieferung des gebauten Frontends als SPA in der Produktion

Wichtige Abhängigkeiten: Fastify, Drizzle ORM (pg-core, node-postgres), Sharp, BullMQ, ioredis, Zod für die Validierung.

Der Server behandelt das kontrollierte Herunterfahren bei SIGTERM/SIGINT: Er lässt HTTP-Verbindungen auslaufen, stoppt die BullMQ-Worker, fährt den Python-Dispatcher herunter und schließt die Datenbankverbindung.

### Web (`apps/web`) {#web-apps-web}

Eine React-19-Single-Page-App, gebaut mit Vite. Nutzt Zustand für die Zustandsverwaltung, Tailwind CSS v4 für das Styling und Lucide für Icons. Kommuniziert mit der API über REST und SSE (für die Fortschrittsverfolgung).

Zu den Seiten gehören ein Werkzeug-Arbeitsbereich, eine Files-Seite zur Verwaltung persistenter Uploads und Ergebnisse, ein Automatisierungs-/Pipeline-Builder und ein Admin-Einstellungspanel.

Das gebaute Frontend wird in der Produktion vom Fastify-Backend ausgeliefert, sodass es im Docker-Container keinen separaten Webserver gibt.

### Docs (`apps/docs`) {#docs-apps-docs}

Diese VitePress-Site. Wird bei jedem Push auf `main` automatisch auf Cloudflare Pages bereitgestellt.

## Wie eine Anfrage abläuft {#how-a-request-flows}

1. Der Benutzer wählt in der Web-UI ein Werkzeug aus und lädt eine Datei hoch.
2. Das Frontend sendet einen Multipart-POST an `/api/v1/tools/:section/:toolId` mit der Datei und den Einstellungen.
3. Die API-Route validiert die Eingabe mit Zod und stellt dann die Verarbeitung zu.
4. Bei Standardwerkzeugen wird der Job in den passenden BullMQ-Pool eingereiht (image, media oder docs je nach Modalität). Der In-Prozess-BullMQ-Worker richtet das Bild anhand der EXIF-Metadaten automatisch aus, führt die Prozessfunktion des Werkzeugs aus und gibt das Ergebnis zurück.
5. Bei KI-Werkzeugen sendet die TypeScript-Brücke eine Anfrage an den persistenten Python-Dispatcher (oder startet ersatzweise einen frischen Subprozess), wartet auf dessen Abschluss und liest die Ausgabedatei.
6. Der Job-Fortschritt wird in der `jobs`-Tabelle in PostgreSQL persistiert, sodass der Zustand Container-Neustarts überdauert. Echtzeit-Updates werden über SSE unter `/api/v1/jobs/:jobId/progress` geliefert.
7. Die API gibt ein `jobId` und ein `downloadUrl` zurück. Der Benutzer lädt die verarbeitete Datei von `/api/v1/download/:jobId/:filename` herunter.

Bei Pipelines führt die API die Ausgabe jedes Schritts als Eingabe an den nächsten weiter und führt sie sequenziell aus.

Bei der Stapelverarbeitung nutzt die API BullMQ-Flows mit Kind-Jobs pro Schritt und gibt eine ZIP-Datei mit allen verarbeiteten Dateien zurück.

## Ressourcen-Footprint {#resource-footprint}

SnapOtter ist auf geringen Speicherverbrauch im Leerlauf ausgelegt. Beim Start wird nichts vorgeladen oder warmgehalten.

### Im Leerlauf {#at-idle}

Der Node.js-/Fastify-Prozess, PostgreSQL und Redis laufen. Der typische Leerlauf-RAM beträgt **~200-300 MB** über alle drei Container hinweg (Node.js-Prozess, Postgres und Redis). Kein Python-Prozess, keine Modellgewichte im Speicher.

### Was startet, und wann {#what-starts-and-when}

| Komponente | Startet bei | Speicher während aktiv |
|-----------|-------------|---------------------|
| Fastify-Server + Postgres + Redis | Containerstart | ~200-300 MB gesamt |
| BullMQ-Worker | Containerstart (im Prozess) | Ein Worker pro Pool (image, media, ai, docs, system) |
| Python-Dispatcher | Erste KI-Werkzeuganfrage | Python-Interpreter + vorab importierte Bibliotheken (PIL, NumPy, MediaPipe, rembg) - keine Modellgewichte |
| KI-Modellgewichte | Während der Anfrage des jeweiligen Werkzeugs | Von der Festplatte geladen, nach Abschluss der Anfrage freigegeben |

### Modellladen {#model-loading}

Alle Modellgewichtsdateien (insgesamt mehrere GB) liegen jederzeit auf der Festplatte in `/opt/models/`. Jedes KI-Werkzeug-Skript lädt nur seine eigenen Modelle für die Dauer einer Anfrage in den Speicher und gibt sie dann frei. Einige Skripte rufen nach der Inferenz explizit `del model` und `torch.cuda.empty_cache()` auf, um sicherzustellen, dass der Speicher sofort zurückgegeben wird.

Es gibt keinen Modell-Cache zwischen Anfragen. Führt man dasselbe KI-Werkzeug direkt hintereinander aus, wird das Modell jedes Mal neu geladen. Das hält den Leerlaufspeicher nahe null, auf Kosten einer Modellladeverzögerung bei jeder KI-Anfrage.

### Kaltstart bei der ersten KI-Anfrage {#first-ai-request-cold-start}

Der Python-Dispatcher läuft nicht, wenn der Container startet. Die erste KI-Anfrage löst zwei Dinge parallel aus: Der Dispatcher beginnt im Hintergrund aufzuwärmen, und die Anfrage selbst weicht auf einen einmaligen Python-Subprozess-Start aus. Sobald der Dispatcher bereit signalisiert, nutzen alle nachfolgenden KI-Anfragen ihn direkt und sparen sich die Kosten des Subprozess-Starts.
