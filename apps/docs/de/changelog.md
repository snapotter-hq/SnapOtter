---
description: "Release Notes und Versionsverlauf für SnapOtter. Sieh dir an, was in jedem Release neu ist, verbessert und behoben wurde."
i18n_source_hash: d3c5fc4c6b75
i18n_provenance: human
i18n_output_hash: f6c291e58ed1
---

# Changelog {#changelog}

## v2.2.0 {#v2-2-0}

Der Großteil von 2.2 ist Härtung. Ein Nicht-Admin mit einer delegierten `users:manage`-Rolle konnte eine Instanz übernehmen, und es stellte sich heraus, dass jedem Werkzeug-Endpunkt die Berechtigungsprüfung fehlte. Aktualisiere, wenn du mehr als einen Benutzer betreibst.

Der Rest ist der lange Schwanz des Selbst-Hostings: Downloads, die starteten und nie fertig wurden, Presets, die brachen, sobald man eine zweite Datei hinzufügte, Container, die in einer Neustartschleife hingen, während Postgres noch hochfuhr. Zwei neue Werkzeuge sind auch dazugekommen. Docs und Website sind jetzt in 21 Sprachen übersetzt, und die Oberfläche erfüllt endlich den WCAG-AA-Kontrast.

> [!IMPORTANT]
> Wenn du `users:manage` über eine benutzerdefinierte Rolle an einen Nicht-Admin vergeben hast, konnte diese Rolle in 2.0.0 bis 2.1.0 Administrator-Konten übernehmen. Details unter Sicherheit.

### Sicherheit {#v2-2-0-security}

- **Rechteausweitung über eine delegierte `users:manage`-Rolle (GHSA-9xgh-95qh-2x7h).** Ein Nicht-Admin mit `users:manage` über eine benutzerdefinierte Rolle konnte das Passwort eines höher privilegierten Kontos zurücksetzen oder das Konto löschen, einschließlich eines eingebauten Administrators, und so die Instanz übernehmen. Passwort-Reset und Kontolöschung prüfen jetzt die Befugnis des Aufrufers über das Ziel, sodass eine delegierte Rolle nicht über ihre eigene Stufe hinausreichen kann. Betroffen: 2.0.0 bis 2.1.0. Gemeldet von 李春来 (Chunlai Li). (#616)
- **Jeder Werkzeug-Endpunkt ist jetzt abgesichert.** Der Werkzeugzugriff wurde Route für Route erzwungen, sodass sich alle 45 handgeschriebenen Routen an denselben Aufruf erinnern mussten, und keine davon tat es. Eine Rolle ohne `tools:use` konnte trotzdem image-to-pdf, erase-object, upscale, sign-pdf und den Rest ausführen. Die Prüfung sitzt jetzt in einem einzigen preHandler, der an der passenden Route ansetzt, sodass sie Unterpfade und jede später hinzugefügte Route abdeckt. (#646)
- **Rate Limiting war bei Docker-Installationen umgehbar.** Das Image lieferte `TRUST_PROXY=true` aus, sodass die Client-IP aus einem Request-Header kam und ein gefälschtes `X-Forwarded-For` am Login-Limiter vorbeikam. Der Standard ist jetzt eine Trust-Liste für private Netzwerke. (#649)
- **Einstellungs-Schreibvorgänge werden pro Einstellung geprüft**, nicht einmal an der Tür, und der Konfigurationsimport ist jetzt transaktional, sodass ein abgelehnter Schlüssel keine halb angewandte Konfiguration hinterlassen kann. (#618)
- **Dateinamen in der Bibliothek können ihr Speicher-Wurzelverzeichnis nicht verlassen.** Ein manipulierter gespeicherter Name, den ein bösartiger 1.x-SQLite-Import unverändert übernimmt, konnte Dateien außerhalb des Dateiverzeichnisses lesen oder löschen. Erreichbar nur, nachdem ein Betreiber eine vom Angreifer gelieferte 1.x-SQLite-Datenbank importiert hat, also der einzige Pfad, auf dem ein gespeicherter Name gewählt werden kann. Gemeldet von @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Job-Abbruch erzwingt Eigentum**, sodass ein authentifizierter Benutzer nicht mehr den Job eines anderen Benutzers über dessen ID abbrechen kann. Gemeldet von @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Ein erneutes Audit des gesamten 2.0-Baums fand, was noch offen war**: Eine abgefangene SAML-Assertion konnte wiederverwendet werden, eine MFA-Herausforderung überstand beliebig viele falsche Codes, die API-Schlüssel-Suche pro Anfrage war ein vollständiger Tabellenscan, `MAX_WORKSPACE_SIZE_GB` war tote Konfiguration, und der SVG-Sanitizer ließ nicht in Anführungszeichen gesetzte `javascript:`-Hrefs durch. (#620)
- **Neun offengelegte CVEs gepatcht**: fast-uri, svgo, sharp und tar transitiv (#619), plus Pillow 12.3.0 (#517). RAW-Decoding auf arm64 baut jetzt LibRaw 0.22.2 aus dem Quellcode, statt eine ungepatchte Systemkopie zu verlinken. (#649)

### Neue Funktionen {#v2-2-0-new-features}

- **Runder Zuschnitt**: Masken als abgerundetes Quadrat und im iOS-Squircle-Stil, mit einer Steuerung für den Eckenradius. Gebaut für Favicons und App-Icons. (#602)
- **GIF-Hintergrund entfernen**: Entferne den Hintergrund aus einem animierten GIF, WebP oder APNG Bild für Bild und erhalte eine transparente Animation zurück. (#502)
- **Objektradierer mit Lasso und High-Quality-Modus**: Ziehe eine Freiform-Schleife, statt jedes Pixel zu malen, und installiere optional ein Diffusion-Inpainting-Bundle für sauberere großflächige Füllungen. (#503, #566)
- **Als neu speichern oder überschreiben.** Das Bearbeiten einer Datei aus der Bibliothek ersetzte bisher stillschweigend das Original. Jetzt entscheidest du pro Bearbeitung, und der Standard behält es. (#564, #577)
- **Seitenverhältnis-Presets in Bildgröße ändern.** Wähle 1:1, 4:3 oder 16:9 und die beiden Dimensionen bleiben gesperrt, ohne Hochskalierung. (#530)
- **Zweistufiges OCR**: Eine schnelle Stufe ist ins Image eingebacken und läuft offline ohne Download, und eine genauere Laufzeit lässt sich bei Bedarf installieren. (#519)
- **Tippe irgendwo, um zu suchen.** Fang an, auf dem Dashboard oder der Startseite zu tippen, und es landet im Suchfeld. (#644)
- **Dokumentation und Website in 21 Sprachen**: Die Docs-Seite, die Landingpages und die API-Referenz sind jetzt übersetzt und gesellen sich zur App-Oberfläche. Ein neuer Leitfaden für ressourcenschwache Deployments behandelt Raspberry Pi und 2-GB-Maschinen. (#548)
- **Klarere Werkzeugnamen**: 18 mehrdeutige Namen qualifizieren sich jetzt selbst, aus "Compress" wurde "Compress Image". Werkzeug-IDs und Routen bleiben unverändert, sodass nichts Gespeichertes bricht. (#520)

### Verbesserungen {#v2-2-0-improvements}

- **WCAG-AA-Kontrast in der gesamten Oberfläche**: Die Palette wurde neu abgestimmt, sodass kräftiges Orange auf Füllungen bleibt, während Text und Beschriftungen barrierefreie Ink-Tokens verwenden, und alle 57 Fokusindikatoren erfüllen jetzt die 3:1-Anforderung für Nicht-Text. (#567, #574)
- **Hochskalierung und Hintergrundentfernung wirken nicht mehr eingefroren**: Der Fortschrittsbalken läuft während der Inferenz weiter, statt bei 30 % zu stehen, und beide Werkzeuge warnen jetzt, dass ein reiner CPU-Host deutlich langsamer ist. (#605, #608)
- **Timeout-Meldungen nennen die echte Ursache** und berücksichtigen reine CPU-Hosts, statt den Upload zu beschuldigen. (#596)
- **SnapOtter wartet beim Start auf Postgres und Redis**, statt in einer Neustartschleife zu hängen, sowohl in Compose als auch im All-in-One-Image. Eine Proxmox-LXC-Installation startete vorher 76-mal neu. (#537, #595)
- **Downloads überstehen einen Reverse Proxy**: SnapOtter bittet nginx und kompatible Proxys, Dateiantworten nicht zu puffern, der übliche Grund, warum ein selbst gehosteter Download startet und nie fertig wird. (#604, #607)
- **PDF komprimieren landet nahe an der Zielgröße** und sagt ehrlich Bescheid, wenn ein Ziel unerreichbar ist. (#522)
- **Mobile Werkzeug-Steuerungen bleiben erreichbar**, jetzt da sich die App-Hüllen an das dynamische Viewport anpassen. (#559)
- **Audio konvertieren zeigt eine Abtastraten-Einstellung.** (#561)
- **Admins können die Mindest-Passwortlänge lockern**, bis hinunter zu 1 für eine vertrauenswürdige LAN-Instanz. (#543)
- **MFA ist Self-Service**, die Aussperrung durch die Richtlinie ist geschlossen, und OIDC- oder SAML-Logins erhalten eine echte MFA-Herausforderung statt einer harten Sperre. (#531, #536)
- **Ein blankes `Error: Error` nennt jetzt seine Ursache.** Sharp-Encoding-Fehler, Beendigungen des KI-Sidecars, Nicht-JSON-Ausgaben des Dokument-Sidecars und Fehler bei der Hintergrundentfernung kamen bisher mit entferntem Grund an. (#532, #534, #535, #538, #612)
- **Der Hilfe-Dialog ist übersetzt.** Seine Tastenkürzel-Beschriftungen und der Erste-Schritte-Text waren hartkodiertes Englisch, während fertige Übersetzungen in allen 21 Locale-Dateien ungenutzt lagen. (#647)

### Fehlerbehebungen {#v2-2-0-bug-fixes}

- **iPhone-HEIC-Dateien wurden abgelehnt** als nicht lesbar, bevor sie den Decoder erreichten, der sie verarbeitet. (#631)
- **Konvertierungs-Presets scheiterten bei einer zweiten Datei**: jpg-to-pdf und seine image-to-pdf-Geschwister sowie pdf-to-png, pdf-to-jpg und pdf-to-tiff gaben alle `Tool not found` zurück, sobald man zwei Dateien hochgeladen hatte. (#633, #643)
- **PDF-Konvertierungs-Presets verloren ihre Download-Schaltfläche.** (#629)
- **Ein unbegrenztes Verarbeitungs-Timeout wurde nicht beachtet**, und hängende Fortschrittsstreams erholen sich jetzt, statt die Oberfläche warten zu lassen. (#638)
- **Downloads hingen, statt zu scheitern**, wenn eine gespeicherte Datei kürzer war als ihre aufgezeichnete Länge. (#617)
- **PDF-Seitenwerkzeuge scheiterten bei kurzen und verschlüsselten Dateien**: Seiten entfernen verwendete standardmäßig einen Seitenbereich, den kein Dokument unter sechs Seiten hat, und passwortgeschützte PDFs scheiterten kryptisch im Worker. (#594)
- **PDF zu Text gab bei gescannten PDFs stillschweigend eine leere Datei zurück.** Es verweist jetzt auf OCR und liefert Text als UTF-8. (#603)
- **PDF zu Word verlor farbige Textblöcke** und teilte sie über die Seite auf. (#500)
- **Der Objektradierer hinterließ Geisterreste** und verwischte kleine Objekte in hochauflösenden Bildern. (#501)
- **Video stabilisieren schrieb nicht abspielbare Ausgaben** ohne faststart. (#593)
- **Reparaturen im Bildeditor**: Drehen, Spiegeln, Größe ändern, Gradationen, Kurven, Filter und Ebenensperre. (#597)
- **PDF signieren zeigte eine leere Leinwand**, statt zu melden, warum eine PDF nicht geladen werden konnte. (#545)
- **Die Dateibibliothek zeichnete 0x0-Dimensionen auf** und übersprang Vorschauen für HEIC-, RAW- und PSD-Uploads. (#636, #637)
- **Die Installation von mehr als einem KI-Bundle** hinterließ die gemeinsame virtuelle Umgebung mit mehreren Versionen und brach still drei Werkzeuge. (#649)
- **Die Konvertierung nach JXL mit Qualität 1 bis 4 gab einen 500 zurück**, und ein fehlendes ffmpeg wurde als beschädigter Upload gemeldet. (#649)
- **Ein kurzer Postgres-Ausfall ließ fertige Jobs stranden**, sodass Ausgaben auf der Platte lagen, ohne dass eine Zeile darauf zeigte. Ein Reconciler übernimmt diese Arbeit jetzt, statt sie fallenzulassen. (#649)
- **Ein Redis-Endpunkt, der die Adresse wechselte, blockierte jeden Consumer**, während Health-Checks weiterhin 200 antworteten. (#649)
- **Website- und Docs-Korrekturen**: Lokalisierte Links verlieren keine `#`-Fragmente mehr und schreiben `zh-CN` nicht mehr klein, die Docs-Navigation bleibt auf Tablets im Viewport, und keine der beiden Seiten ruft mehr die GitHub-API aus deinem Browser auf. (#516, #562, #570, #560)

### Upgrade-Hinweise {#v2-2-0-upgrade-notes}

Nichts zu migrieren, aber zwei ausgelieferte Standards haben sich geändert:

- **`TRUST_PROXY` ist jetzt standardmäßig `loopback,linklocal,uniquelocal`**, statt jedem Peer zu vertrauen. Docker-Bridge- und Compose-Netzwerke liegen in diesem Bereich, daher brauchen die meisten Setups keine Änderung. Wenn dein Reverse Proxy SnapOtter von einer öffentlichen Adresse aus erreicht, setze `TRUST_PROXY` explizit, sonst ordnen Rate Limiting und Audit-Logs jede Anfrage dem Proxy zu.
- **`MAX_AI_JOBS_PER_USER` ist standardmäßig 5** gleichzeitige Einzeldatei-KI-Jobs pro Benutzer. Batch- und Pipeline-KI-Läufe bleiben unbegrenzt.

Neue optionale Schalter: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (standardmäßig aus) und `GIF_BG_MAX_FRAMES`.

### Danksagungen {#v2-2-0-acknowledgements}

Ein guter Teil dieses Releases begann als Fehlerbericht von jemand anderem.

Code und Beiträge:

- **@mvanhorn** ❤️: Verwandelte den Timeout-Fehler der Hintergrundentfernung in eine Meldung, die sagt, was zu tun ist, statt in einen blanken Timeout. (#518, #494)
- **@EuanTop** ❤️: Stellte die Download-Aktion auf PDF-Konvertierungs-Preset-Seiten wieder her, indem er die synchrone Route den Standard-Vertrag für Werkzeuge zurückgeben lässt. (#629, #623)
- **@harshjainnn** ❤️: Diagnostizierte den Download, der startet und nie fertig wird, und schlug die Socket-Reset-Richtung vor, auf der der Fix aufbaut. (#617, #590)

Sicherheitsmeldungen:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Meldete privat die Rechteausweitung über eine delegierte `users:manage`-Rolle, mit einer vollständigen Source-to-Sink-Analyse und einer funktionierenden Exploit-Kette. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Meldete eine authentifizierte IDOR beim Job-Abbruch und einen Path Traversal in gespeicherten Dateinamen der Bibliothek, erreichbar nach einem bösartigen 1.x-SQLite-Import, mit einem funktionierenden Proof of Concept für beides. (#599, #600)

Fehlerberichte:

- **@riz467** ❤️: Echte iPhone-HEIC-Dateien, die bei der Validierung abgelehnt wurden, mit der im Bericht herausgearbeiteten Ursache. (#622)
- **@coupej** ❤️: PDF-Preset-Seiten, die für immer hingen, und jpg-to-pdf, das scheiterte, sobald eine zweite Datei hinzukam. Zwei verschiedene Bugs, korrekt getrennt. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` war als unbegrenzt dokumentiert, aber auf fünf Minuten begrenzt. (#630)
- **@bezibaerchen** ❤️: Audio konvertieren verbarg die Abtastraten-Einstellung, die seine eigene Beschreibung versprach. (#558)
- **@hell-toupee** ❤️: Das genaue OCR-Bundle ließ sich mit einem `libpaddle`-Fehler nicht installieren. (#505)
- **@Michael1260** ❤️ und **@And-CSH** ❤️: Bestätigten diesen OCR-Installationsfehler unabhängig und stellten fest, dass manuelle Extraktion funktioniert, der In-App-Installer aber nicht, was den Bug beim Installer festnagelte. (#505)
- **@TomErnst1972** ❤️: Das Aktivieren der MFA-Pflichtrichtlinie sperrte einen Admin aus seiner eigenen Instanz aus. (#515)
- **@thokich** ❤️: Objektradieren erzeugte unscharfe, unbrauchbare Füllungen, was sowohl die HD-Inpainting-Neufassung als auch das optionale High-Quality-Bundle vorantrieb. (#141)
- **@Hennie-git** ❤️: Eine Proxmox-LXC-Installation, die 76-mal gegen ein Postgres neu startete, das noch keine Verbindungen annahm. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Triagierte diesen Bericht in Echtzeit und lieferte die Diagnose, auf der der Start-Fix aufbaut. (#537)

Funktionswünsche und Feedback:

- **@LECOQQ** ❤️: Bat darum, die Passwortkomplexität bei einer Home-Server-Installation zu lockern. (#136)
- **@killervette42** ❤️: Bat um eine Unraid Community App, die jetzt im Unraid CA Store veröffentlicht ist. (#96)
- **@alienatedsec** ❤️: Wiesen darauf hin, dass der Fix für den GPU-Rückfall auf CPU in einem geschlossenen Issue vergraben und unauffindbar war, weshalb er jetzt in den Deployment-Docs steht. (#490, #587)
- **@neilp316** ❤️: Bestätigte den Blackwell-GPU-Fehler auf einer RTX 5060 und kartierte einen funktionierenden CUDA-12.8-Upgradepfad. (#120)
- **@Roiki11** ❤️: Plädierte für geteilten Speicher mit Pfadreferenzen statt HTTP-Dateitransfer für KI-Compute außerhalb der Box. (#189)

Danke auch an die Community-Mitglieder, die diese über Discord und E-Mail gemeldet haben und deren Namen wir nicht erfasst haben: die Squircle-Zuschnitt-Anfrage (#602), den image-to-PDF-Download, der startete und nie fertig wurde (#604, #607), das hängende Werkzeug Seiten entfernen (#594), fehlenden arabischen Text in pdf-to-text (#603) und die Diagnose hinter dem ONNX-GPU-Rückfall (#490).

[Vollständiger Diff auf GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

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
