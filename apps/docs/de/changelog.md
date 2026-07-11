---
description: "Release Notes und Versionsverlauf für SnapOtter. Sieh dir an, was in jedem Release neu ist, verbessert und behoben wurde."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: 0143a28c7896
---

# Changelog {#changelog}

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 macht aus dem Bildwerkzeugkasten eine vollständige Suite zur Dateibearbeitung: 200+ Werkzeuge über fünf Modalitäten hinweg (Image, Video, Audio, PDF und Files), neu aufgebaut auf Postgres 17 und einer Redis-gestützten Job-Warteschlange, mit einem `docker run` mit nur einem Befehl. Dies ist ein Major-Release; lies vor dem Upgrade von 1.x den Abschnitt Breaking Changes.

### Neue Funktionen {#new-features}

- **Vier neue Werkzeug-Modalitäten**: Video, Audio, PDF und Files ergänzen Image und bringen den Katalog auf 200+ Werkzeuge.
- **Dauerhafte Hintergrund-Jobs**: Eine Redis-gestützte Warteschlange (BullMQ) führt jedes Werkzeug als nachverfolgten Job mit Live-SSE-Fortschritt aus.
- **All-in-One-Modus mit einem einzigen Container**: Ein `docker run` startet eine vollständige Instanz mit eingebettetem Postgres und Redis.
- **KI-Bundles auf Abruf**: Hintergrundentfernung, OCR, Transkription, Hochskalierung, Gesichtserkennung und -verbesserung, Objektradierer, Kolorierung und Fotorestaurierung lassen sich über die UI installieren. Die GPU-Beschleunigung wird pro Framework erkannt.
- **Sign PDF**: Zeichne, tippe oder lade eine Signatur hoch und platziere sie im Browser auf einer PDF.
- **Automate**: Ein visueller Pipeline-Builder, der Werkzeuge verkettet, mit neun vorgefertigten Vorlagen.
- **83 Konvertierungs-Presets mit einem Klick**: Dedizierte JPG-zu-PNG-, MP4-zu-GIF- und ähnliche Konverter mit unscharfer Suche.
- **Ebenenbasierter Bildeditor**: Ein Konva-basierter Editor unter `/editor` mit Pinseln, Formen, Anpassungen, Filtern und Kurven.
- **Files-Bibliothek**: Speichere jedes Ergebnis und verwende es als Eingabe für ein anderes Werkzeug erneut.
- Angeheftete Werkzeuge, Zoom und Verschieben direkt auf der Leinwand, 21 Sprachen und Enterprise-Fähigkeiten (OIDC/SSO, SAML, SCIM, S3-Storage, werkzeugspezifische Berechtigungen, Audit-Export, verteiltes Tracing).

### Verbesserungen {#improvements}

- Einen laufenden Vorgang abbrechen. (#137)
- Vollauflösendes RAW-Decoding über LibRaw, einschließlich DNG. (#289)
- Deployments ohne Root und mit fremder UID (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Genaue Erkennung der KI-Installation und ein gehärteter Installationsablauf. (#214, #352)
- Datenschutzhärtung: kein automatischer Drittanbieter-Egress, plus ein optionaler strikter Offline-Modus.
- Immer sichtbarer Feedback-Button, auch bei deaktivierter Analyse.

### Fehlerbehebungen {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` deaktiviert die Ratenbegrenzung für Werkzeug-Routen wieder. (#271)
- Reparierte KI-virtualenv-Pfade innerhalb des Docker-Images. (#390)
- Kompatibilität mit sharp 0.35.2+. (#362)
- Layout-Korrekturen im Bildeditor: Lineale, Füllverhalten, Seitenleiste und Leinwandgröße. (#258, #259)
- Die italienische Übersetzung abgeschlossen. (#231, #206, #425)
- Audio-Normalisierung und loudnorm behalten die Abtastrate der Quelle bei.
- SSRF-Härtung: numerischer IPv6-CIDR-Abgleich und ein erweiterter URL-Vorabscan. (#287)
- Erzeugte PDFs werden mit SnapOtter als Producer gestempelt.
- mediapipe installiert sich unter Python 3.13 und Debian 13.

### Breaking Changes {#breaking-changes}

2.0 ersetzt die eingebettete SQLite-Datenbank durch Postgres 17 und fügt Redis 8 für die Job-Warteschlange hinzu. Deine 1.x-Daten migrieren beim ersten Start automatisch, aber der Container-Stack hat sich geändert, sichere daher zuerst dein gesamtes `/data`-Volume (1.x betreibt SQLite im WAL-Modus, sodass die committeten Daten normalerweise in `snapotter.db-wal` liegen). Wähle dann das Single-Container-Image (eingebettetes Postgres und Redis, nur als Root) oder den Compose-Stack (App plus Postgres 17 und Redis 8). Siehe den [Migrationsleitfaden](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) und den [Upgrade-Leitfaden](/de/guide/upgrading).

### Upgrade {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Oder mit Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Vollständiger Diff auf GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Neues HTML-zu-Image-Werkzeug, Barrierefreiheit nach WCAG 2.2 AA, Sicherheitshärtung aus Penetrationstests und 5 kritische Docker-Fixes.

### Neue Funktionen {#new-features-1}

- **HTML zu Image**: Erfasse Screenshots von URLs oder rohem HTML als PNG/JPEG/WebP. Ganzseitige Aufnahmen, benutzerdefinierte Viewports, Dark Mode.
- **Docker-_FILE-Secret-Konvention**: Binde sensible Umgebungsvariablen als Dateien statt im Klartext ein. (#205)
- **Enterprise-Lizenzierung und S3-Storage**: Optionaler kommerzieller Lizenzschlüssel und S3-kompatibler Objektspeicher.
- **Verbesserungen am Formeneditor**: Transparenz für Füllung/Kontur, RGBA-Farbwähler, gestrichelte Linienstile.
- **Vorgefertigte Release-Archive**: Lade Tarballs aus den GitHub Releases für Nicht-Docker-Installationen (Proxmox, Bare Metal, LXC) herunter. (#202)

### Verbesserungen {#improvements-1}

- **Barrierefreiheit nach WCAG 2.2 AA**: Sprungnavigation, Fokus-Trapping, aria-live-Bereiche, Unterstützung für reduzierte Bewegung, korrekte Kontrastverhältnisse. (#209)
- **Mobile Reaktionsfähigkeit**: Responsive Einstellungen, automatische SSE-Wiederverbindung beim Tab-Wechsel auf Mobilgeräten. (#203, #204)
- **Qualität der Hintergrundentfernung**: Kantenglättung, Farbdekontamination, Auswahl des Ausgabeformats.
- **Italienische Übersetzung**: ~145 neue Strings von @albanobattistella. (#206)
- **Werkzeugspezifische API-Dokumentation**: 53 Doku-Seiten mit Parametern, Beispielen und Antwortformaten.
- **KI-Modell-Downloads**: Wiederholungslogik mit exponentiellem Backoff für HuggingFace. (#201)

### Fehlerbehebungen {#bug-fixes-1}

- Frische Docker-Container waren völlig unbrauchbar (die Ratenbegrenzung blockierte alle Anfragen).
- KI-Werkzeuge zur Gesichtserkennung (blur-faces, red-eye-removal, enhance-faces, passport-photo) schlugen auf allen Plattformen fehl.
- HEIC-Dateien auf ARM defekt (libheif-Symbolkonflikt).
- Die KI-Bundles für Upscale und restore-photo ließen sich auf ARM nicht installieren.
- OCR verwendete auf GPU-Containern die falsche CUDA-Version.
- Umgehung des SSRF-Schutzes über hexadezimale IPv4-in-IPv6-Adressen. (Dank an: @tonghuaroot)
- iPhone-HEIC-Decoding mit Zusatzbildern. (#183, #199)
- Real-ESRGAN-CUDA-OOM auf 8-GB-GPUs. (#200)
- 6 Sentry-Fehler aus der Produktion und 7 QA-Bugs. (#208)

### Sicherheit {#security}

- 10 Befunde aus Penetrationstests behoben (XFF-Umgehung, Abstürze durch fehlerhaftes JSON, unbegrenzte Pipelines, XSS im Audit-Log, TRACE-Methode und mehr). (#207)
- Hexadezimale IPv6-SSRF-Umgehung blockiert. (Dank an: @tonghuaroot)
- Basis-Images im Dockerfile per Digest gepinnt.

### Upgrade {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Oder mit Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Vollständiger Diff auf GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Live-Demo, werkzeugspezifische Landing Pages und eine Reihe von Feinschliff-Korrekturen.

### Neue Funktionen {#new-features-2}

- **Live-Demo** - Mit [demo.snapotter.com](https://demo.snapotter.com) können Leute SnapOtter ausprobieren, ohne etwas zu installieren.
- **Werkzeug-Übersichtsseite** - Durchstöbere alle 50+ Werkzeuge unter `/tools` mit Suche und Kategoriefiltern.
- **50+ SEO-Landing-Pages** - Jedes Werkzeug hat jetzt eine eigene Landing Page mit FAQs, Anwendungsfällen und Vergleichstabellen.
- **Hintergrundvorschau** - Ein Vorher-Nachher-Schieberegler zeigt einen karierten Hintergrund hinter transparenten Bildern.
- **Generator für starke Passwörter** - Button mit einem Klick im Formular Mitglieder hinzufügen.

### Fehlerbehebungen {#bug-fixes-2}

- Das HEIC/HEIF-Info-Werkzeug schlägt nicht mehr fehl (Pre-Decode hinzugefügt).
- Die Installation von KI-Modell-Bundles zeigt bessere Fehlermeldungen und respektiert Ressourcenlimits.
- Bibliotheks-Thumbnails laden korrekt (Auth-Header fehlten).
- Dropdown-Menüs werden in den Tabellen der People- und Teams-Einstellungen nicht mehr abgeschnitten.
- Der Prozentwert des Größenvergleichs bei Nicht-Komprimierungswerkzeugen ausgeblendet.
- Doppelten Link zur Datenschutzrichtlinie entfernt.
- Italienische Übersetzung für die Einstellungen der KI-Funktionen hinzugefügt.
- Umbenannte Lucide-Icons aktualisiert (Wand2, Columns).

### Infrastruktur {#infrastructure}

- OpenSSF Scorecard von 4.3 auf ~7.0 gehärtet.
- CI-Tests in 4 Shards parallelisiert mit verkleinerten Fixtures.
- 41 Abhängigkeits-Updates.

### Upgrade {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Oder mit Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Vollständiger Diff auf GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Fünf neue Werkzeuge, ein vollständiger Bildeditor, SSO-Login, 20 Sprachen. Wahrscheinlich hätten das drei separate Releases sein sollen, aber hier sind wir.

### Neue Funktionen {#new-features-3}

- **Bildeditor** - Ebenen, Pinsel, Formen, Anpassungen, Filter, Kurven, Tastenkürzel. Läuft in deinem Browser, verarbeitet auf deiner Hardware.
- **OIDC-/SSO-Authentifizierung** - Anmeldung mit Google, GitHub, Okta oder einem beliebigen OpenID-Connect-Anbieter. Setze ein paar Umgebungsvariablen und dein Team nutzt seine bestehenden Konten.
- **Meme-Generator** - 100 integrierte Vorlagen mit Textdarstellung über opentype.js. Oder lade dein eigenes Bild hoch.
- **Beautify** - Wirf einen Screenshot hinein, erhalte ein poliertes Bild. Geräterahmen (macOS, Windows, Browser), Schatten, Farbverläufe, Social-Media-Presets.
- **Simulation von Farbfehlsichtigkeit** - Sieh dir eine Vorschau an, wie Bilder mit Protanopie, Deuteranopie, Tritanopie und anderen Farbsehschwächen aussehen.
- **PNG-Transparenz-Fixer** - Erkennt scheintransparente PNGs und behebt sie mit BiRefNet-HR-Matting. Optionale Wasserzeichenentfernung über LaMa-Inpainting.
- **KI-Leinwanderweiterung** - Erweitere Bildgrenzen mit KI-Füllung. Drei Qualitätsstufen (schnell, ausgewogen, Qualität), je nachdem, wie viel GPU-Zeit du eintauschen möchtest.
- **20 Sprachen** - Arabisch, Chinesisch (vereinfacht/traditionell), Tschechisch, Niederländisch, Französisch, Deutsch, Hindi, Indonesisch, Italienisch, Japanisch, Koreanisch, Polnisch, Portugiesisch, Russisch, Spanisch, Thai, Türkisch, Ukrainisch, Vietnamesisch. RTL funktioniert für Arabisch.
- **URL-Import** - Füge URLs in die Dropzone ein oder importiere sie in Massen aus einer Liste. Serverseitiger Abruf mit SSRF-Schutz.
- **Mehrdatei-Radierer** - Zeichne Radiermasken über mehrere Bilder und verarbeite sie alle mit einem Klick. Striche bleiben pro Bild erhalten.
- **Pipeline-Import/-Export** - Speichere Werkzeugketten als JSON und teile sie mit anderen.
- **17 neue Kamera-RAW-Formate** über exiftool, plus QOI-, JP2-, EPS-, DDS-, CUR-, DPX-, FITS-, PPM/PGM/PBM-, SVGZ- und APNG-Eingabe. Neue Ausgabe-Codecs für BMP, ICO, JP2, QOI. AVIF-, TIFF-, GIF-, JXL- und PSD-Export aus einem zuvor verlorenen Branch wiederhergestellt.

### Verbesserungen {#improvements-2}

- **Bildverbesserung** - Die alte Pipeline durch CLAHE + normalise + gamma ersetzt. Ein neuer Deep-Enhance-Schalter nutzt das KI-Modell für aggressivere Ergebnisse.
- **Foto restaurieren** - Kratzererkennung neu geschrieben mit 8-Winkel-Otsu-Filterung. LaMa-Inpainting läuft jetzt in nativer Auflösung.
- **Exotische Formate überall** - OCR, image-to-PDF, Favicon-Generator, Komposition, Stitch und Vektorisierung decodieren jetzt alle HEIC, RAW, PSD.
- **Komprimieren** - Toleranz für die Zielgröße von 5 % auf 1 % verengt. Die Zielgröße ist der Standardmodus. Stepper-Buttons und eine KB/MB-Einheitenauswahl hinzugefügt.
- **Sentry-Bereinigung** - 644 nicht handlungsrelevante Ereignisse gefiltert. Echte Fehler werden jetzt korrekt behandelt.
- **GPU-Erkennung** - Bessere Diagnose für Container, in denen CUDA vorhanden ist, nvidia-smi aber nicht.
- **Modus mit deaktivierter Authentifizierung** - Ein anonymer Benutzer wird mit der Admin-Rolle in der DB angelegt. API-Schlüssel, Pipelines und Benutzerdateien scheitern nicht mehr an FK-Constraints.
- **2.705+ neue Tests** über Unit, Integration und E2E.

### Fehlerbehebungen {#bug-fixes-3}

- Upscale auf der CPU läuft auf NAS-Boxen und stromsparender Hardware nicht mehr in ein Timeout.
- Ein QR-Code-Logo lässt die Vorschau nicht mehr dauerhaft verschwinden.
- Überlauf beim Zuschneiden bei hohen Hochformatbildern behoben.
- TIFF-Alpha-Dateien erzwingen korrekt eine PNG-Ausgabe, statt Korruption zu erzeugen.
- Das HDR/EXR-Decoding konvertiert vor CLAHE nach 8-Bit und behebt so Decoding-Fehler.
- Eingabepuffer für Gesichtslandmarken werden vor dem Python-Sidecar nach PNG konvertiert und beheben so Abstürze.
- Die Duplikatsuche kommt mit gemischten Formatstapeln und Netzwerkfehlern zurecht.
- Die Beautify-Vorschau aktualisiert sich in Echtzeit.
- Fortschrittsbalken für Stitch und Vektorisierung.
- SVGZ wird von SVG-zu-Raster verarbeitet.
- Nicht-ASCII-Dateinamen über einen prozentkodierten X-File-Results-Header behoben.

### Upgrade {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Oder mit Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Vollständiger Diff auf GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Vereinheitlichtes Docker-Image mit GPU-Autoerkennung. Ein Image bewältigt sowohl CPU- als auch GPU-Workloads. Compose zu einer einzigen Datei mit Log-Rotation vereinfacht. Modell-Vorabdownloads umfassen jetzt Verifikation und einen Smoke-Test.

---

## v1.13.0 {#v1-13-0}

Rollenbasierte Zugriffskontrolle (RBAC). 14 granulare Berechtigungen, drei integrierte Rollen (admin, editor, user), Unterstützung für benutzerdefinierte Rollen. Berechtigungsprüfungen auf allen API-Routen. Frontend-Tabs nach Benutzerberechtigungen gefiltert.

---

## v1.12.0 {#v1-12-0}

PDF-zu-Image-Werkzeug. Konvertiere PDF-Seiten nach PNG, JPEG, WebP oder TIFF mit benutzerdefinierter DPI. Vereinheitlichtes Docker-Image mit GPU-Autoerkennung.

---

## v1.11.0 {#v1-11-0}

Automatisch generierte llms.txt über vitepress-plugin-llms für KI-freundliche Dokumentation.

---

## v1.10.0 {#v1-10-0}

Inhaltsbewusstes Skalieren (Seam Carving) mit Gesichtsschutz. Skaliere Bilder unter Beibehaltung wichtiger Inhalte.

---

## v1.9.0 {#v1-9-0}

Stitch-/Combine-Werkzeug. Füge Bilder nebeneinander, vertikal gestapelt oder in einem benutzerdefinierten Raster zusammen.

---

## v1.8.0 {#v1-8-0}

Metadaten-bearbeiten-Werkzeug. Zeige und bearbeite EXIF-, IPTC- und XMP-Metadaten mit einer granularen Entfernen-/Behalten-Oberfläche.

---

## Ältere Releases {#older-releases}

Das vollständige Changelog auf Commit-Ebene inklusive Patch-Releases findest du in den [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
