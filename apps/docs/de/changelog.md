---
description: "Versionshinweise und Versionsverlauf von SnapOtter. Sehen Sie, was in jeder Version neu, verbessert und behoben wurde."
i18n_source_hash: 952098c65251
i18n_provenance: machine
i18n_output_hash: 85bb0950e6bf
i18n_hash_version: 2
---

# Änderungsprotokoll {#changelog}

## v2.3.0 {#v2-3-0}

SnapOtter hat gerade eine Million Image-Pulls über Docker Hub und GHCR sowie 3.000 Sterne auf GitHub überschritten. Das sind sehr viele selbst gehostete Server, und dieses Release ist unser Dank an alle, die sie betreiben.

Aktualisieren Sie bald. 2.3.0 schließt sechs Sicherheitshinweise, einen davon mit hohem Schweregrad. Details finden Sie unten im Abschnitt Sicherheit.

Neben den Korrekturen gibt es neue Tools: einen PDF-Multi-Tool-Seiteneditor, Ein-Klick-Voreinstellungen zum Komprimieren auf eine Zielgröße für Bilder und PDFs sowie Drag-and-drop-Seitenanordnung in Organize PDF. OCR liest jetzt Arabisch, und pdf-to-text bietet OCR an, wenn es auf ein gescanntes PDF trifft. SnapOtter kann hinter einem Reverse Proxy unter einem Unterpfad wie `/snapotter` laufen. Die App benötigt zum Betrieb keinen Postgres-Superuser mehr. Ausgesperrte Administratoren können sich über die Kommandozeile wieder Zugang verschaffen. Der Rest sind rund 1.400 Korrekturen, die meisten davon für Probleme, die Sie gemeldet haben.

> [!IMPORTANT]
> Alle sechs unten genannten Sicherheitshinweise betreffen 2.2.0, und einige reichen bis 2.0.0 zurück. Wenn Sie eine Instanz mit anderen Benutzern teilen oder über Ihr eigenes Netzwerk hinaus verfügbar machen, aktualisieren Sie.

### Sicherheit {#v2-3-0-security}

- **SVG-Uploads konnten die Bereinigung umgehen (GHSA-9c7h-xjrp-8gh3, hoch).** Ein SVG, das der Bilddecoder ablehnte, wurde unverändert gespeichert und ausgeliefert, statt bereinigt zu werden. Betroffen: 2.2.0 und früher. Gemeldet von @xaferima. (#1211)
- **Der Job-Fortschrittsstream prüfte nicht, wer anfragte (GHSA-ff22-w6x2-fm98, mittel).** Er verlangt jetzt eine Anmeldung und die Besitzerschaft des Jobs. Betroffen: 2.0.0 bis 2.2.0. (#1750)
- **Download-Links für Ergebnisse lieferten auch den ursprünglichen Upload aus (GHSA-jgv3-2jc6-f628, mittel).** Betroffen: 2.2.0 und früher. Gemeldet von @emirhancatkin. (#3623)
- **Passfoto und Hintergrundeffekte vertrauten einer vom Client gelieferten Job-ID (GHSA-3c8g-8v4x-qq9j, mittel).** Betroffen: 2.2.0 und früher. Gemeldet von @shaoyuuuuu. (#3623)
- **URL-Import, Upload und Vorschau übersprangen die Berechtigungsprüfungen für Rollen und API-Schlüssel (GHSA-8xxr-g2w8-7f9r, mittel).** Betroffen: 2.2.0 und früher. Gemeldet von @nguyenvantiennani. (#3780, #707)
- **Die SSO-Erzwingung verriet den Break-Glass-Benutzernamen (GHSA-q6fg-vvw9-cr8r, niedrig).** Eine abgelehnte lokale Anmeldung erhält jetzt dasselbe 401 wie jede andere fehlgeschlagene Anmeldung. Betroffen: 2.0.0 bis 2.2.0. (#2148)
- **Postgres läuft nicht mehr als Superuser.** Die App verbindet sich jetzt mit einer Rolle, die Daten nur lesen und schreiben kann. Migrationen verwenden eine separate, optionale Verbindung. Siehe Upgrade-Hinweise. (#918)
- **Gepatchte Abhängigkeiten**: Die Override-Untergrenzen für dompurify und handlebars wurden auf die korrigierten Versionen angehoben. (#4247)

### Neue Funktionen {#v2-3-0-new-features}

- **PDF Multi-Tool**: ein Seiteneditor, der Seiten umordnet, dupliziert, dreht und löscht und Seiten aus anderen PDFs übernimmt. Der Server stellt die fertige Datei zusammen. (#1338)
- **Mit einem Klick auf eine Zielgröße komprimieren**: fünf Bild-Voreinstellungen (20, 50, 100, 200, 500 KB) und fünf PDF-Voreinstellungen (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **SnapOtter unter einem Unterpfad betreiben**: Setzen Sie `BASE_PATH=/snapotter`, und dasselbe Image wird von dort ausgeliefert. Ergebnislinks, Cookies, SSO-Weiterleitungen und die API-Dokumentation folgen diesem Pfad. (#1252, #1324)
- **Arabische OCR**: Wählen Sie Arabisch ausdrücklich, oder lassen Sie den automatischen Modus es erkennen. Funktioniert für Bild- und PDF-OCR. (#4130, #4183)
- **pdf-to-text bietet OCR an**, wenn ein PDF oder ein ganzer Batch keine Textebene hat, statt eine leere Datei zurückzugeben. (#4142, #4198)
- **Drag-and-drop-Seitenanordnung in Organize PDF**, mit Maus und Touch. (#1249, #2601)
- **Dateien vor einem Lauf mit mehreren Dateien umordnen**: Merge, Stitch, Collage und die anderen Tools für mehrere Dateien behalten die von Ihnen festgelegte Reihenfolge. (#756, #757)
- **Batch- und Pipeline-Läufe abbrechen**, und die Arbeit stoppt auf dem Server tatsächlich. (#807)
- **`snapotter-admin`-Wiederherstellungsbefehle**: `reset-password`, `create-admin`, `unlock-user` und MFA-Zurücksetzung, für Administratoren, die aus der Weboberfläche ausgesperrt sind. (#4016)
- **MFA-Einrichtung bei der Anmeldung**: Wenn MFA erforderlich ist, richten Benutzer ohne MFA sie direkt ein, statt blockiert zu werden.
- **Kameraaufnahme und installierbare App**: Nehmen Sie auf dem Mobilgerät ein Foto direkt in ein Tool auf und installieren Sie SnapOtter als PWA. (#773)
- **Transparenter Rand im Dialog Canvas-Größe des Editors.** (#4111)
- **Update-Hinweise für Administratoren**: Wenn eine neuere SnapOtter-Version verfügbar ist, sehen Administratoren einen ausblendbaren Hinweis mit einem Link zu den Versionshinweisen. Die Prüfung läuft über die vorhandene Analytics-Verbindung und ist daher ausgeschaltet, wenn Analytics ausgeschaltet ist.

### Verbesserungen {#v2-3-0-improvements}

- **Die Hintergrundentfernung ist bei wiederholten Läufen schneller**: Das Modell bleibt zwischen Anfragen geladen, statt jedes Mal neu zu laden. (#4144)
- **Batch-Uploads benötigen deutlich weniger Speicher**: Jede Datei geht auf den Scratch-Datenträger und wird einzeln verarbeitet, statt im RAM zu liegen. (#2687)
- **Installationen von KI-Bundles schlagen sauber fehl und werden zurückgerollt**, statt ein halb installiertes venv zu hinterlassen. Installationen der Hintergrundentfernung unter Proxmox LXC funktionieren wieder, und Hosts mit wenig Speicher erhalten vernünftige CPU-Limits, bevor ein Job startet. (#2628, #2597, #2526, #2546)
- **Die GPU-Erkennung ist zuverlässiger**: CUDA wird über den Treiber erkannt, Karten der RTX-50-Serie fallen auf die CPU zurück, statt zu scheitern, und Hardware-Videoencoder werden vor der Verwendung probeweise ausgeführt. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` funktioniert jetzt**. Es wurde zwar geparst, aber nie angewendet. (#3249)
- **Lange Tools erhalten das lange Timeout**: pdf-to-word, compress-pdf, convert-document und inhaltsbewusstes Skalieren laufen bei großen Dateien nicht mehr zu früh in ein Timeout. (#3276)
- **Compress PDF hält Scans lesbar** und meldet es, wenn eine Zielgröße nicht erreichbar ist, statt eine unlesbare Datei zu erzeugen. (#4112)
- **Fehlgeschlagene Anmeldungen werden pro Benutzername gedrosselt**: Mehr als zehn in fünfzehn Minuten ergeben ein 429 mit `Retry-After`. (#827)
- **Fehler sagen, was schiefgelaufen ist**: Fehlende Binärdateien, Speicherfehler, Out-of-Memory-Abbrüche und Upload-Limits erhalten jetzt spezifische Meldungen statt eines nackten 500 oder 422.
- **Das Audit-Protokoll deckt Tool-, Batch- und Pipeline-Läufe ab**, und Benutzer-, Rollen-, Team- und DSGVO-Ereignisse halten fest, wer was mit wem getan hat. (#3991, #3984)
- **Der All-in-one-Container hält bei einem fehlerhaften ersten Start an**, statt endlos neu zu starten, und das eingebettete Postgres und Redis haben Start-Fristen. (#3008, #1130)
- **Datumsangaben und Plurale folgen Ihrer Sprache**, und die letzten fest einprogrammierten englischen Zeichenfolgen sind übersetzt.
- **Feinschliff für Mobilgeräte und Editor**: Layouts für Schieberegler, Sign PDF und Zuschneiden auf Smartphones, Touch-Ziehen, schnellere Pixelpinsel sowie Levels und Curves in Rückgängig und Autosave.

### Fehlerbehebungen {#v2-3-0-bug-fixes}

- **Adjust Colors kombinierte Einstellungen falsch**: Temperatur, Sättigung, Farbton, Kontrast und Sepia überschrieben sich gegenseitig, statt sich zu addieren. (#3153, #3120, #3469)
- **Pixelate pixelte nicht**, und die PNG-Ausgabe wurde in den Bildtools stillschweigend auf eine Palette reduziert. (#709, #716)
- **Animierte GIFs und WebPs verloren Frames** in mehreren Tools, und GIF-Paletten und Transparenz waren falsch. (#1184, #1225, #3407, #2573)
- **Gedrehte Uploads verloren Qualität**: Auto-Orient verwarf verlustfreie Kodierung, Transparenz und 16-Bit-Tiefe. Animiertes WebP dreht jetzt jeden Frame. (#2384, #2529)
- **TIFFs mit Transparenz, AV1-HEIF-Dateien und mehrere RAW-Formate** schlugen fehl oder verloren den Alphakanal. (#2609, #2572, #1120)
- **Das Ändern der Editor-Canvas-Größe skalierte das Bild**, statt Platz darum herum hinzuzufügen. (#2081)
- **Ausgabedateinamen wurden verstümmelt**: `.jpeg` und `.tif` wurden zu etwas anderem, und Dotfiles oder Namen, die ihre Erweiterung wiederholen, funktionierten nicht. (#3495, #3382)
- **Das automatische Speichern in der Bibliothek ignorierte das Speicherkontingent**, und Speicherzähler konnten negativ werden. (#2389, #2585)
- **Nach einem Neustart hängende Jobs** werden jetzt beim Start abgeschlossen, statt für immer "in Verarbeitung" anzuzeigen. (#3219, #3193)
- **Die OIDC-Anmeldung nannte jeden neuen Benutzer "admin"**, und Anmeldungen in iOS Safari endeten nach dem Erfolg auf einer Fehlerseite. (#862, #4021)
- **Deaktivierte Passwortregeln wurden beim Erstellen von Benutzern trotzdem durchgesetzt.** (#1028)
- **Beschädigte PDFs hingen 30 Sekunden**, bevor sie fehlschlugen. (#920)
- **Die Datenträgerprüfung für KI-Bundles verlangte etwa 18 GB**, um ein einzelnes Bundle zu installieren. (#1248)
- **Compress Video schlug bei Bildschirmaufnahmen mit variabler Bildrate fehl.** (#2427)
- **Die Batch-Hintergrundentfernung verlor fertige Ergebnisse**, wenn der Browser die Anfrage wiederholte. (#2015)
- **Zahlenfelder in den Einstellungen ließen sich beim Tippen nicht leeren.** (#1449)
- **Das Ausschalten von Analytics ließ eingereihte Ereignisse zurück**, die etwa 30 Sekunden später gesendet wurden. Sie werden jetzt verworfen, wenn Sie sich abmelden (Opt-out). (#4270)

### Upgrade-Hinweise {#v2-3-0-upgrade-notes}

Migrationen laufen beim Start von selbst. Sie müssen kein SQL ausführen.

- **Datenbankrollen.** Die kanonische Compose-Datei gibt der App jetzt eine Rolle, die Daten nur lesen und schreiben kann (`DATABASE_URL`), und eine separate privilegierte Verbindung (`DATABASE_MIGRATION_URL`), die nur beim Start für Migrationen und Rechte verwendet wird. Eine bestehende Compose-Datei funktioniert weiterhin wie bisher: Lassen Sie `DATABASE_MIGRATION_URL` ungesetzt, dann läuft SnapOtter mit einer Rolle. Setzen Sie bei einer nicht lokalen Bereitstellung `POSTGRES_APP_PASSWORD` zusammen mit `POSTGRES_PASSWORD`.
- **Strengere Startprüfungen.** Diese schlugen früher später oder unbemerkt fehl. Jetzt halten sie den Container mit einer Meldung an, die die Variable nennt: ein nicht unterstütztes `DEFAULT_LOCALE` (verwenden Sie einen unterstützten Code wie `de`, nicht `de_DE`), fehlerhafte `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL` oder `OIDC_ISSUER_URL`, wenn SSO aktiv ist, eine ungültige `TRUST_PROXY`-Liste, ein fehlerhaftes `BASE_PATH` und ein nicht beschreibbares `LOG_DIR`.
- **`TRUST_PROXY` akzeptiert keine Hop-Anzahl mehr.** Ein Wert wie `TRUST_PROXY=2` hält den Container jetzt beim Start an, statt stillschweigend keinem Proxy zu vertrauen. Setzen Sie die Proxy-Adressen oder benannte Bereiche (der Standard ist `loopback,linklocal,uniquelocal`), `false`, wenn kein Proxy vor SnapOtter sitzt, oder `true` nur, wenn ein von Ihnen kontrollierter Proxy auf einer öffentlichen Adresse vorgeschaltet ist. (#998)
- **`MAX_WORKER_THREADS` wirkt jetzt.** Wenn Sie es gesetzt und bisher keine Änderung bemerkt haben, sehen Sie sie jetzt.
- **API-Statuscodes.** Engine- und Speicherfehler liefern 503 `ENGINE_UNAVAILABLE` (Batch-Endpunkte lieferten früher 422). Uploads über dem Limit liefern 413 (vorher 400). Eine fehlerhafte `clientJobId` liefert 400 und eine wiederverwendete 409 (vorher 500). Das erneute Abspielen Ihres eigenen Pipeline-Batches liefert 202. `mode=targetSize` ohne `targetSizeKb` liefert 400. Eine abgelehnte lokale Anmeldung bei SSO-Erzwingung liefert 401 statt 403 `SSO_ENFORCED`. Gedrosselte Anmeldungen liefern 429 `LOGIN_THROTTLED`. Das Ergebnis von remove-background enthält `originalUrl` nicht mehr.
- **Neue optionale Variablen**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (standardmäßig 15 Minuten, `0` deaktiviert es), `EMBEDDED_REDIS_TIMEOUT_S` (180) und `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **Compose-Dateien werden mit dem Release ausgeliefert.** `docker-compose.yml` und `docker-compose-gpu.yml` sind diesem Release angehängt, sodass Sie sie direkt von der Release-Seite herunterladen können.

### Danksagungen {#v2-3-0-acknowledgements}

Eine Million Pulls bedeuten viele Menschen, die Fehler melden, Korrekturen einsenden und uns sagen, was fehlte. Dieses Release ist größtenteils ihr Werk.

Code und Beiträge:

- **@zakka258** ❤️: Hat den PDF-Multi-Tool-Seiteneditor und die Bereitstellung unter einem Unterpfad gebaut, zwei der größten Funktionen dieses Releases, einschließlich der Tests für Authentifizierung und SSO unter einem Unterpfad. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Hat die Ein-Klick-Voreinstellungen zum Komprimieren von Bildern auf eine Zielgröße gebaut, Vorschau-Nebenläufigkeit und -Bereinigung korrigiert und verhindert, dass blockierter Browserspeicher den Anmelde-Spinner hängen lässt. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Hat Drag-and-drop-Seitenumordnung zu Organize PDF hinzugefügt, die zuvor in den Discussions angefragt worden war. (#1249, #965)
- **@drakeo338** ❤️: Zehn Korrekturen im gesamten Stack, darunter Auto-Orient mit erhaltenem Format und erhaltener Qualität, SCIM-Gruppen, die in einer Transaktion erstellt werden, KI-Installationen unter cgroup v2 und 5xx-Fehler, die nicht mehr als 422 maskiert werden. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Hat transparenten Canvas-Rand im Editor hinzugefügt, veraltete Zielgrößen-Urteile in Compress PDF korrigiert und partielle Team-Updates erlaubt. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Hat verhindert, dass selbst gehostete Instanzen Heatmap-Daten senden, `TRUST_PROXY` beim Start validiert, statt abzustürzen, und die Behandlung von SCIM-Gruppennamen und qpdf-Timeouts korrigiert. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Hat mehrere 500er in korrekte 400er- und 409er-Antworten für fehlerhafte Job-IDs und Multipart-Importe umgewandelt und das Leeren von Zahlenfeldern in den Einstellungen korrigiert. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Hat das Lesen von Barcodes offline ermöglicht, indem der Decoder mitgeliefert wird, Medienvorschauen korrigiert, die die Eingabe zeigten, und die Formatsuche verbessert. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Hat gemeldet und behoben, dass Compress Video bei Bildschirmaufnahmen mit variabler Bildrate fehlschlug. (#2426, #2427)
- **@dvd233** ❤️: Hat jedes vom Decoder unterstützte Kamera-RAW-Format verfügbar gemacht und dafür gesorgt, dass Favicon-Tools bei ICO-Suchen erscheinen. (#1120, #1121)
- **@bercedev** ❤️: Hat Dateinamen korrigiert, deren Stamm die Erweiterung wiederholt, und dafür gesorgt, dass die KI das Gerät meldet, auf dem sie tatsächlich läuft. (#3382, #3613)
- **@pamod-madubashana** ❤️: Hat die letzte nur englische MFA-Überschrift übersetzt und ungenutzte Fortschrittszeichenfolgen angebunden. (#1228, #1227)
- **@mvanhorn** ❤️: Hat die doppelte Vergabe von Benutzernamen bei der SAML-Anmeldung korrigiert. (#2640)
- **@peremunoz** ❤️: Hat verhindert, dass die Barcode-Erzeugung Speicher- und Arbeitsspeicherfehler als "Invalid text" verbirgt. (#4057)
- **@mayuriphad** ❤️: Hat einen Absturz bei einem fehlerhaft gespeicherten Auth-Header einer Warnung behoben. (#3080)
- **@DevShoaib78** ❤️: Hat das Schließen des polygonalen Lassos im Editor korrigiert. (#1207)
- **@dltsum** ❤️: Hat Fortschrittsanzeigen auf den gemeinsamen Nachrichtenkatalog umgestellt. (#1262)
- **@albanobattistella** ❤️: Übersetzungskorrekturen. (#1024)
- **@shoaibyazdani** ❤️: Hat die visuellen macOS-Baselines neu erzeugt. (#2475)

Sicherheitsmeldungen:

- **@xaferima** ❤️: Hat herausgefunden, dass vom Decoder abgelehnte SVGs die Bereinigung übersprangen, und mit uns die Auswirkungen aufgearbeitet. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Hat herausgefunden, dass Ergebnislinks auch den ursprünglichen Upload auslieferten. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Hat herausgefunden, dass Passfoto und Hintergrundeffekte einer vom Client gelieferten Job-ID vertrauten. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: Hat herausgefunden, dass der URL-Import Berechtigungsprüfungen übersprang. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: Hat IPv6-Umgehungen der SSRF-Adressprüfungen mit funktionierenden Proofs of Concept gemeldet. Die Korrekturen erschienen in 2.0.0, und dieser Dank ist überfällig. (#287)

Fehlerberichte:

- **@kabo** ❤️: Das Beispiel `docker-compose.yml` funktionierte nicht. (#1027)
- **@xromen** ❤️: Beschädigte PDFs, die bis zu einem 30-Sekunden-Timeout von qpdf hingen. (#920)
- **@snmabaur** ❤️: Die OIDC-Anmeldung setzte jeden Profilnamen auf "admin". (#862)
- **@CodecNomad** ❤️: Das Blur-Tool verdoppelte das Bild. (#829)
- **@ohora0923** ❤️ und **@Alexis-VS-CSharp** ❤️: Pixelate funktionierte nicht. (#678, #775)
- **@mptpro** ❤️: Der KI-Download für die Hintergrundentfernung schlug fehl. (#714)
- **@dominic427** ❤️: Das Ändern der Editor-Canvas-Größe skalierte das Bild, statt es zu erweitern. (#2016)
- **@CodeByToast** ❤️: Zahlenfelder in den Einstellungen, die sich nicht leeren ließen. (#1186)
- **@gioxx** ❤️: Die Datenträgerprüfung für KI-Bundles verlangte etwa 18 GB für ein Bundle. (#1248)
- **@rekcodocker** ❤️ und **@madmike970** ❤️: Installationen von KI-Bundles schlugen unter Proxmox LXC fehl, mit den Container-Details, die bei der Eingrenzung halfen. (#1030, #352)
- **@wxf26054** ❤️: Deaktivierte Passwortregeln wurden beim Erstellen von Benutzern weiterhin durchgesetzt. (#1028)
- **@ersil** ❤️: iOS Safari rief den OIDC-Callback zweimal auf und landete nach einer erfolgreichen Anmeldung auf einer Fehlerseite. (#4021)
- **@casi-3** ❤️: Die Batch-Hintergrundentfernung verlor fertige Ergebnisse, wenn der Browser die Anfrage erneut abspielte, mit einer präzisen Diagnose. (#2015)
- **@killervette42** ❤️: Der Blackwell-GPU-Fehler unter unRaid, der in den CPU-Fallback für die RTX-50-Serie einfloss. (#120, #4075)

Funktionswünsche und Feedback:

- **@photoevents** ❤️: Hat gemessen, dass die Hintergrundentfernung etwa 11 Sekunden mit dem Laden des Modells und 1 Sekunde mit der Inferenz verbrachte, das Zwischenspeichern von Sitzungen vorgeschlagen und geteilt, was beim Betrieb eines eigenen Caches gelernt wurde. Daraus wurde der Sitzungs-Cache in diesem Release. (#768, #776, #4144)
- **@benbou8231** ❤️: Hat darauf hingewiesen, dass importierte Dateien in Tools für mehrere Dateien in umgekehrter Reihenfolge landen, was zum Umordnen vor einem Lauf führte. (#729, #756)
- **@cf3901646** ❤️: Hat einen störenden Produktionsfehler auf die Postgres-Fehlerklasse 58 zurückgeführt und die Korrektur vorgeschlagen. Wir konnten ihren PR ohne unterzeichnete CLA nicht mergen, also haben wir dieselbe Korrektur selbst geschrieben. (#4210, #4253)
- **@chiliec** ❤️: Hat bemerkt, dass ein fehlgeschlagenes Auto-Orient stillschweigend verschluckt wurde und dass der Installationsfortschritt den Übersetzungskatalog ignorierte. Beide Vorschläge wurden über PRs der Maintainer umgesetzt. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Hat vorgeschlagen, den Import des Enterprise-Moduls als Single-Flight auszuführen, die Korrektur dafür, dass gleichzeitige SCIM-Anfragen sich über die Lizenz uneins waren. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Hat darauf hingewiesen, dass die Konfigurationsanleitung die Überschreibungen der Engine-Binärdateien und `SNAPOTTER_HW_ACCEL` nie erwähnte, was jetzt dokumentiert ist. (#1312, #1696)
- **@aron-intframe** ❤️: Hat eine Lücke in der Fehlerbehandlung von exiftool auf einem frischen Klon reproduziert und festgestellt, dass die Race Condition beim temporären Pfad schlimmer war, als das Issue beschrieb. (#3458)

Unser Dank gilt auch den Mitgliedern der Community, die diese Punkte über Discord und E-Mail gemeldet haben und deren Namen wir nicht festgehalten haben.

[Vollständiger Diff auf GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

Der größte Teil von 2.2 ist Härtung. Ein Nicht-Administrator mit einer delegierten Rolle `users:manage` konnte eine Instanz übernehmen, und bei jedem Tool-Endpunkt fehlte die Berechtigungsprüfung. Aktualisieren Sie, wenn Sie mehr als einen Benutzer betreiben.

Der Rest ist der lange Schwanz des Self-Hostings: Downloads, die begannen und nie fertig wurden, Voreinstellungen, die mit der zweiten Datei brachen, und Container, die in Absturzschleifen liefen, während Postgres noch hochfuhr. Zwei neue Tools sind ebenfalls hinzugekommen. Dokumentation und Website sind jetzt in 21 Sprachen übersetzt, und die Oberfläche erreicht endlich den WCAG-AA-Kontrast.

> [!IMPORTANT]
> Wenn Sie `users:manage` über eine benutzerdefinierte Rolle an einen Nicht-Administrator vergeben haben, konnte diese Rolle in den Versionen 2.0.0 bis 2.1.0 Administratorkonten übernehmen. Details unter Sicherheit.

### Sicherheit {#v2-2-0-security}

- **Rechteausweitung über eine delegierte Rolle `users:manage` (GHSA-9xgh-95qh-2x7h).** Ein Nicht-Administrator, der `users:manage` über eine benutzerdefinierte Rolle besaß, konnte das Passwort eines höher privilegierten Kontos, auch eines eingebauten Administrators, zurücksetzen oder es löschen und so die Instanz übernehmen. Das Zurücksetzen des Passworts und das Löschen von Konten prüfen jetzt die Befugnis des Aufrufers über das Ziel, sodass eine delegierte Rolle nicht über ihre eigene Ebene hinausreichen kann. Betroffen: 2.0.0 bis 2.1.0. Gemeldet von 李春来 (Chunlai Li). (#616)
- **Jeder Tool-Endpunkt ist jetzt abgesichert.** Der Tool-Zugriff wurde Route für Route durchgesetzt, sodass alle 45 handgeschriebenen Routen denselben Aufruf nicht vergessen durften, und keine tat es. Eine Rolle ohne `tools:use` konnte weiterhin image-to-pdf, erase-object, upscale, sign-pdf und den Rest ausführen. Die Prüfung liegt jetzt in einem einzigen preHandler, der an der passenden Route hängt, sodass sie Unterpfade und jede später hinzugefügte Route abdeckt. (#646)
- **Die Ratenbegrenzung war bei Docker-Installationen umgehbar.** Das Image lieferte `TRUST_PROXY=true` aus, sodass die Client-IP aus einem Request-Header stammte und ein gefälschtes `X-Forwarded-For` am Login-Limiter vorbeikam. Der Standard ist jetzt eine Vertrauensliste für private Netzwerke. (#649)
- **Einstellungs-Schreibzugriffe werden pro Einstellung geprüft**, nicht einmal an der Tür, und der Konfigurationsimport ist jetzt transaktional, sodass ein abgelehnter Schlüssel keine halb angewendete Konfiguration hinterlassen kann. (#618)
- **Dateinamen in der Bibliothek können ihr Speicher-Stammverzeichnis nicht verlassen.** Ein präparierter gespeicherter Name, den ein bösartiger 1.x-SQLite-Import unverändert kopiert, konnte Dateien außerhalb des Dateiverzeichnisses lesen oder löschen. Nur erreichbar, nachdem ein Betreiber eine vom Angreifer gelieferte 1.x-SQLite-Datenbank importiert, was der einzige Weg ist, einen gespeicherten Namen wählbar zu machen. Gemeldet von @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Der Job-Abbruch erzwingt die Besitzerschaft**, sodass ein authentifizierter Benutzer den Job eines anderen Benutzers nicht mehr über dessen ID abbrechen kann. Gemeldet von @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Ein erneutes Audit des gesamten 2.0-Baums fand, was noch offen war**: Eine abgefangene SAML-Assertion konnte erneut abgespielt werden, eine MFA-Challenge überlebte beliebig viele falsche Codes, die API-Schlüssel-Suche pro Anfrage war ein vollständiger Tabellenscan, `MAX_WORKSPACE_SIZE_GB` war tote Konfiguration, und der SVG-Sanitizer ließ href-Attribute ohne Anführungszeichen mit `javascript:` durch. (#620)
- **Neun bekannte CVEs gepatcht**: fast-uri, svgo, sharp und tar transitiv (#619) sowie Pillow 12.3.0 (#517). Die RAW-Dekodierung auf arm64 baut jetzt LibRaw 0.22.2 aus dem Quellcode, statt eine ungepatchte Systemkopie zu verlinken. (#649)

### Neue Funktionen {#v2-2-0-new-features}

- **Rounded Crop**: Masken in Form abgerundeter Quadrate und iOS-artiger Squircles, mit Regler für den Eckenradius. Gebaut für Favicons und App-Icons. (#602)
- **Remove GIF Background**: Entfernen Sie den Hintergrund eines animierten GIF-, WebP- oder APNG-Frames Bild für Bild und erhalten Sie eine transparente Animation zurück. (#502)
- **Lasso und Modus High Quality im Object Eraser**: Ziehen Sie eine freie Schleife, statt jedes Pixel zu übermalen, und installieren Sie optional ein Diffusions-Inpainting-Bundle für sauberere Füllungen großer Flächen. (#503, #566)
- **Als neu speichern oder überschreiben.** Das Bearbeiten einer Bibliotheksdatei löste früher stillschweigend das Original ab. Sie wählen jetzt pro Bearbeitung, und der Standard behält es. (#564, #577)
- **Seitenverhältnis-Voreinstellungen in Resize.** Wählen Sie 1:1, 4:3 oder 16:9, und die beiden Dimensionen bleiben gekoppelt, ohne Hochskalierung. (#530)
- **Zweistufige OCR**: Eine schnelle Stufe ist im Image eingebaut und läuft offline ohne Download, und eine genauere Laufzeit wird bei Bedarf installiert. (#519)
- **Überall tippen, um zu suchen.** Beginnen Sie auf dem Dashboard oder der Startseite zu tippen, und die Eingabe landet im Suchfeld. (#644)
- **Dokumentation und Website in 21 Sprachen**: Die Dokumentationsseite, die Landing-Pages und die API-Referenz sind jetzt alle übersetzt und schließen sich der App-Oberfläche an. Eine neue Anleitung für ressourcenarme Bereitstellungen deckt den Raspberry Pi und Rechner mit 2 GB ab. (#548)
- **Klarere Tool-Namen**: 18 mehrdeutige Namen qualifizieren sich jetzt selbst, sodass aus "Compress" nun "Compress Image" wurde. Tool-IDs und Routen bleiben unverändert, sodass nichts Gespeichertes bricht. (#520)

### Verbesserungen {#v2-2-0-improvements}

- **WCAG-AA-Kontrast in der gesamten Oberfläche**: Die Palette wurde neu abgestimmt, sodass das leuchtende Orange auf Flächen bleibt, während Text und Beschriftungen barrierefreie Ink-Tokens verwenden, und alle 57 Fokusindikatoren erreichen jetzt die 3:1-Hürde für Nicht-Text. (#567, #574)
- **Upscale und Hintergrundentfernung wirken nicht mehr eingefroren**: Der Fortschrittsbalken rückt während der Inferenz vor, statt bei 30 % zu parken, und beide Tools warnen jetzt, dass ein reiner CPU-Host deutlich langsamer ist. (#605, #608)
- **Timeout-Meldungen nennen die wahre Ursache** und berücksichtigen reine CPU-Hosts, statt den Upload verantwortlich zu machen. (#596)
- **SnapOtter wartet beim Start auf Postgres und Redis**, statt in eine Absturzschleife zu geraten, sowohl in Compose als auch im All-in-one-Image. Eine Proxmox-LXC-Installation startete zuvor 76-mal neu. (#537, #595)
- **Downloads überstehen einen Reverse Proxy**: SnapOtter bittet nginx und kompatible Proxys, Dateiantworten nicht zu puffern, was der übliche Grund dafür ist, dass ein selbst gehosteter Download beginnt und nie fertig wird. (#604, #607)
- **Compress PDF landet nahe an der Zielgröße** und sagt ehrlich, wenn ein Ziel außer Reichweite ist. (#522)
- **Die Steuerelemente der Tools bleiben auf Mobilgeräten erreichbar**, jetzt da die App-Shells sich an die dynamische Viewport-Größe anpassen. (#559)
- **Convert Audio bietet eine Einstellung für die Abtastrate.** (#561)
- **Administratoren können die Mindestlänge von Passwörtern lockern**, bis hinunter auf 1 für eine Instanz in einem vertrauenswürdigen LAN. (#543)
- **MFA ist Self-Service**, die Richtlinien-Aussperrung ist behoben, und OIDC- oder SAML-Anmeldungen erhalten eine echte MFA-Abfrage statt einer harten Sperre. (#531, #536)
- **Ein nacktes `Error: Error` nennt jetzt seine Ursache.** Sharp-Kodierungsfehler, Abbrüche des KI-Sidecars, Nicht-JSON-Ausgaben des Dokument-Sidecars und Fehler der Hintergrundentfernung kamen früher alle ohne den entfernten Grund an. (#532, #534, #535, #538, #612)
- **Der Hilfedialog ist übersetzt.** Seine Tastenkürzel-Beschriftungen und der Einstiegstext waren fest einprogrammiertes Englisch, während fertige Übersetzungen ungenutzt in allen 21 Locale-Dateien lagen. (#647)

### Fehlerbehebungen {#v2-2-0-bug-fixes}

- **HEIC-Dateien vom iPhone wurden abgelehnt** und als unlesbar eingestuft, bevor sie den Decoder erreichten, der sie verarbeitet. (#631)
- **Konvertierungs-Voreinstellungen scheiterten bei einer zweiten Datei**: jpg-to-pdf und seine image-to-pdf-Geschwister sowie pdf-to-png, pdf-to-jpg und pdf-to-tiff lieferten alle `Tool not found`, sobald Sie zwei Dateien hochluden. (#633, #643)
- **PDF-Konvertierungs-Voreinstellungen verloren ihre Download-Schaltfläche.** (#629)
- **Ein unbegrenztes Verarbeitungs-Timeout wurde nicht beachtet**, und blockierte Fortschrittsstreams erholen sich jetzt, statt die Oberfläche warten zu lassen. (#638)
- **Downloads hingen, statt fehlzuschlagen**, wenn sich eine gespeicherte Datei als kürzer als ihre aufgezeichnete Länge herausstellte. (#617)
- **PDF-Seitentools scheiterten bei kurzen und verschlüsselten Dateien**: Remove Pages verwendete standardmäßig einen Seitenbereich, den kein Dokument unter sechs Seiten hat, und passwortgeschützte PDFs scheiterten kryptisch im Worker. (#594)
- **PDF to Text gab bei gescannten PDFs stillschweigend eine leere Datei zurück.** Es verweist jetzt auf OCR und liefert Text als UTF-8. (#603)
- **PDF to Word verlor farbige Textblöcke** und verteilte sie über die Seite. (#500)
- **Object Eraser hinterließ Geisterreste** und verwischte kleine Objekte in hochauflösenden Bildern. (#501)
- **Stabilize Video schrieb nicht abspielbare Ausgaben** ohne faststart. (#593)
- **Reparaturen im Bildeditor**: Drehen, Spiegeln, Skalieren, Levels, Curves, Filter und Ebenensperre. (#597)
- **Sign PDF zeigte eine leere Canvas**, statt zu melden, warum ein PDF nicht geladen werden konnte. (#545)
- **Die Dateibibliothek erfasste Abmessungen von 0x0** und übersprang Vorschauen für HEIC-, RAW- und PSD-Uploads. (#636, #637)
- **Die Installation von mehr als einem KI-Bundle** ließ das gemeinsame virtuelle Environment mehrfach versioniert zurück und beschädigte stillschweigend drei Tools. (#649)
- **Die Konvertierung nach JXL bei Qualität 1 bis 4 lieferte einen 500**, und ein fehlendes ffmpeg wurde Ihnen als beschädigter Upload gemeldet. (#649)
- **Ein vorübergehender Postgres-Ausfall ließ fertige Jobs verwaist zurück**, mit Ausgabe auf dem Datenträger, auf die keine Zeile verwies. Ein Reconciler übernimmt diese Arbeit jetzt, statt sie zu verwerfen. (#649)
- **Ein Redis-Endpunkt, der seine Adresse änderte, blockierte jeden Consumer**, während Health-Checks weiterhin 200 beantworteten. (#649)
- **Korrekturen an Website und Dokumentation**: Lokalisierte Links verlieren keine `#`-Fragmente mehr und schreiben `zh-CN` nicht mehr klein, die Navigation der Dokumentation bleibt auf Tablets im Viewport, und keine der beiden Seiten ruft mehr die GitHub-API aus Ihrem Browser auf. (#516, #562, #570, #560)

### Upgrade-Hinweise {#v2-2-0-upgrade-notes}

Es ist nichts zu migrieren, aber zwei ausgelieferte Standardwerte haben sich geändert:

- **`TRUST_PROXY` hat jetzt den Standardwert `loopback,linklocal,uniquelocal`** statt jedem Peer zu vertrauen. Docker-Bridge- und Compose-Netzwerke liegen innerhalb dieses Bereichs, sodass die meisten Setups keine Änderung benötigen. Wenn Ihr Reverse Proxy SnapOtter von einer öffentlichen Adresse aus erreicht, setzen Sie `TRUST_PROXY` ausdrücklich, sonst ordnen Ratenbegrenzung und Audit-Protokolle jede Anfrage dem Proxy zu.
- **`MAX_AI_JOBS_PER_USER` hat den Standardwert 5** gleichzeitig laufende KI-Jobs mit einer Datei pro Benutzer. KI-Läufe in Batches und Pipelines bleiben unbegrenzt.

Neue optionale Stellschrauben: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (standardmäßig aus) und `GIF_BG_MAX_FRAMES`.

### Danksagungen {#v2-2-0-acknowledgements}

Ein guter Teil dieses Releases begann als der Fehlerbericht von jemand anderem.

Code und Beiträge:

- **@mvanhorn** ❤️: Hat den Timeout-Fehler von remove-background in eine Meldung umgeschrieben, die sagt, was zu tun ist, statt eines nackten Timeouts. (#518, #494)
- **@EuanTop** ❤️: Hat die Download-Aktion auf den Seiten der PDF-Konvertierungs-Voreinstellungen wiederhergestellt, indem die synchrone Route den Standardvertrag für Tool-Ergebnisse liefert. (#629, #623)
- **@harshjainnn** ❤️: Hat den Download diagnostiziert, der beginnt und nie fertig wird, und die Richtung des Socket-Resets vorgeschlagen, auf der die Korrektur aufbaut. (#617, #590)

Sicherheitsmeldungen:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Hat die Rechteausweitung über eine delegierte Rolle `users:manage` vertraulich gemeldet, mit einer vollständigen Analyse von der Quelle bis zur Senke und einer funktionierenden Exploit-Kette. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Hat ein authentifiziertes IDOR beim Job-Abbruch gemeldet sowie einen Path Traversal bei gespeicherten Dateinamen der Bibliothek, erreichbar nach einem bösartigen 1.x-SQLite-Import, jeweils mit einem funktionierenden Proof of Concept. (#599, #600)

Fehlerberichte:

- **@riz467** ❤️: Echte HEIC-Dateien vom iPhone wurden bei der Validierung abgelehnt, mit der im Bericht ausgearbeiteten Ursache. (#622)
- **@coupej** ❤️: Seiten für PDF-Voreinstellungen, die ewig hingen, und jpg-to-pdf, das scheiterte, sobald eine zweite Datei hinzukam. Zwei verschiedene Fehler, korrekt getrennt. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` war als unbegrenzt dokumentiert, aber auf fünf Minuten begrenzt. (#630)
- **@bezibaerchen** ❤️: Convert Audio verbarg die Abtastraten-Einstellung, die seine eigene Beschreibung versprach. (#558)
- **@hell-toupee** ❤️: Das Bundle der genauen OCR ließ sich mit einem `libpaddle`-Fehler nicht installieren. (#505)
- **@Michael1260** ❤️ und **@And-CSH** ❤️: Haben diesen OCR-Installationsfehler unabhängig bestätigt und festgestellt, dass die manuelle Extraktion funktioniert, der Installer in der App aber nicht, was den Fehler auf den Installer eingrenzte. (#505)
- **@TomErnst1972** ❤️: Das Aktivieren der Richtlinie "MFA erforderlich" sperrte einen Administrator aus seiner eigenen Instanz aus. (#515)
- **@thokich** ❤️: Object Erasing erzeugte unscharfe, unbrauchbare Füllungen, was sowohl die Neufassung des HD-Inpaintings als auch das optionale High-Quality-Bundle auslöste. (#141)
- **@Hennie-git** ❤️: Eine Proxmox-LXC-Installation startete 76-mal neu gegen ein Postgres, das noch keine Verbindungen annahm. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Hat diesen Bericht in Echtzeit eingeordnet und die Diagnose geliefert, auf der die Korrektur beim Start aufbaut. (#537)

Funktionswünsche und Feedback:

- **@LECOQQ** ❤️: Bat darum, die Passwortkomplexität bei einer Home-Server-Installation zu lockern. (#136)
- **@killervette42** ❤️: Bat um eine Unraid Community App, die jetzt im Unraid-CA-Store veröffentlicht ist. (#96)
- **@alienatedsec** ❤️: Hat darauf hingewiesen, dass die Korrektur für den GPU-Fallback auf die CPU in einem geschlossenen Issue vergraben und nicht auffindbar war, weshalb sie jetzt in der Bereitstellungsdokumentation steht. (#490, #587)
- **@neilp316** ❤️: Hat den Blackwell-GPU-Fehler auf einer RTX 5060 bestätigt und einen funktionierenden Upgrade-Pfad auf CUDA 12.8 aufgezeigt. (#120)
- **@Roiki11** ❤️: Hat für gemeinsamen Speicher mit Pfadverweisen statt HTTP-Dateitransfer bei KI-Berechnungen außerhalb der Maschine argumentiert. (#189)

Unser Dank gilt auch den Mitgliedern der Community, die diese Punkte über Discord und E-Mail gemeldet haben und deren Namen wir nicht festgehalten haben: die Anfrage für den Squircle-Zuschnitt (#602), der image-to-PDF-Download, der begann und nie fertig wurde (#604, #607), das Hängen des Tools Delete Pages (#594), fehlender arabischer Text in pdf-to-text (#603) und die Diagnose hinter dem ONNX-GPU-Fallback (#490).

[Vollständiger Diff auf GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 macht aus dem Bild-Toolkit eine vollständige Suite zur Dateibearbeitung: über 200 Tools in fünf Modalitäten (Bild, Video, Audio, PDF und Dateien), neu aufgebaut auf Postgres 17 und einer Redis-gestützten Job-Warteschlange, mit einem `docker run` per Einzelbefehl. Dies ist ein Hauptrelease; lesen Sie Breaking Changes, bevor Sie von 1.x aktualisieren.

### Neue Funktionen {#new-features}

- **Vier neue Tool-Modalitäten**: Video, Audio, PDF und Dateien kommen zu Bild hinzu und bringen den Katalog auf über 200 Tools.
- **Dauerhafte Hintergrund-Jobs**: Eine Redis-gestützte Warteschlange (BullMQ) führt jedes Tool als verfolgten Job mit Live-SSE-Fortschritt aus.
- **All-in-one-Modus mit einem Container**: Ein einziges `docker run` startet eine vollständige Instanz mit eingebettetem Postgres und Redis.
- **KI-Bundles bei Bedarf**: Hintergrundentfernung, OCR, Transkription, Hochskalierung, Gesichtserkennung und -verbesserung, Object Eraser, Colorize und Fotorestaurierung lassen sich aus der Oberfläche installieren. Die GPU-Beschleunigung wird pro Framework erkannt.
- **Sign PDF**: Zeichnen, tippen oder laden Sie eine Signatur hoch und platzieren Sie sie im Browser auf einem PDF.
- **Automate**: Ein visueller Pipeline-Builder, der Tools verkettet, mit neun vorgefertigten Vorlagen.
- **83 Ein-Klick-Konvertierungs-Voreinstellungen**: Eigene Konverter wie JPG-to-PNG, MP4-to-GIF und ähnliche mit unscharfer Suche.
- **Ebenenbasierter Bildeditor**: Ein Konva-basierter Editor unter `/editor` mit Pinseln, Formen, Anpassungen, Filtern und Kurven.
- **Dateibibliothek**: Speichern Sie jedes Ergebnis und verwenden Sie es als Eingabe für ein anderes Tool wieder.
- Angeheftete Tools, Zoom und Schwenken im Canvas, 21 Sprachen und Enterprise-Funktionen (OIDC/SSO, SAML, SCIM, S3-Speicher, Berechtigungen pro Tool, Audit-Export, verteiltes Tracing).

### Verbesserungen {#improvements}

- Einen laufenden Vorgang abbrechen. (#137)
- RAW-Dekodierung in voller Auflösung über LibRaw, einschließlich DNG. (#289)
- Bereitstellungen ohne root und mit fremder UID (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Genaue Erkennung von KI-Installationen und ein gehärteter Installationsablauf. (#214, #352)
- Härtung des Datenschutzes: kein automatischer Verkehr zu Drittanbietern, plus ein optionaler strikter Offline-Modus.
- Immer verfügbare Feedback-Schaltfläche, auch bei ausgeschaltetem Analytics.

### Fehlerbehebungen {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` deaktiviert die Ratenbegrenzung für Tool-Routen wieder. (#271)
- Pfade des virtuellen KI-Environments im Docker-Image repariert. (#390)
- Kompatibilität mit sharp 0.35.2+. (#362)
- Korrekturen am Layout des Bildeditors: Lineale, Füllverhalten, Seitenleiste und Canvas-Größe. (#258, #259)
- Die italienische Übersetzung vervollständigt. (#231, #206, #425)
- Audio-Normalize und loudnorm behalten die Abtastrate der Quelle bei.
- SSRF-Härtung: numerischer IPv6-CIDR-Abgleich und eine erweiterte URL-Vorabprüfung. (#287)
- Erzeugte PDFs tragen SnapOtter als Producer.
- mediapipe lässt sich auf Python 3.13 und Debian 13 installieren.

### Breaking Changes {#breaking-changes}

2.0 ersetzt die eingebettete SQLite-Datenbank durch Postgres 17 und fügt Redis 8 für die Job-Warteschlange hinzu. Ihre 1.x-Daten werden beim ersten Start automatisch migriert, aber der Container-Stack hat sich geändert. Sichern Sie daher zuerst Ihr gesamtes Volume `/data` (1.x betreibt SQLite im WAL-Modus, sodass die committeten Daten meist in `snapotter.db-wal` liegen). Wählen Sie dann das Image mit einem Container (eingebettetes Postgres und Redis, nur root) oder den Compose-Stack (App plus Postgres 17 und Redis 8). Siehe die [Migrationsanleitung](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) und die [Upgrade-Anleitung](/de/guide/upgrading).

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

Neues Tool HTML to Image, WCAG-2.2-AA-Barrierefreiheit, Sicherheitshärtung aus Penetrationstests und 5 kritische Docker-Korrekturen.

### Neue Funktionen {#new-features-1}

- **HTML to Image**: Erfassen Sie Screenshots von URLs oder rohem HTML als PNG/JPEG/WebP. Ganzseitige Aufnahmen, benutzerdefinierte Viewports, Dunkelmodus.
- **Docker-Konvention _FILE für Secrets**: Binden Sie sensible Umgebungsvariablen als Dateien statt im Klartext ein. (#205)
- **Enterprise-Lizenzierung und S3-Speicher**: Optionaler kommerzieller Lizenzschlüssel und S3-kompatibler Objektspeicher.
- **Verbesserungen am Formeneditor**: Transparenz bei Füllung und Kontur, RGBA-Farbwähler, gestrichelte Linienstile.
- **Vorgefertigte Release-Archive**: Laden Sie Tarballs aus den GitHub Releases für Installationen ohne Docker herunter (Proxmox, Bare Metal, LXC). (#202)

### Verbesserungen {#improvements-1}

- **WCAG-2.2-AA-Barrierefreiheit**: Navigation überspringen, Fokusfalle, aria-live-Regionen, Unterstützung für reduzierte Bewegung, korrekte Kontrastverhältnisse. (#209)
- **Responsivität auf Mobilgeräten**: Responsive Einstellungen, automatische SSE-Wiederverbindung beim Wechsel des Tabs auf Mobilgeräten. (#203, #204)
- **Qualität der Hintergrundentfernung**: Kantenglättung, Farbdekontamination, Auswahl des Ausgabeformats.
- **Italienische Übersetzung**: ~145 neue Zeichenfolgen von @albanobattistella. (#206)
- **API-Dokumentation pro Tool**: 53 Dokumentationsseiten mit Parametern, Beispielen und Antwortformaten.
- **Downloads von KI-Modellen**: Wiederholungslogik mit exponentiellem Backoff für HuggingFace. (#201)

### Fehlerbehebungen {#bug-fixes-1}

- Frische Docker-Container waren völlig unbrauchbar (die Ratenbegrenzung blockierte alle Anfragen).
- KI-Tools zur Gesichtserkennung (blur-faces, red-eye-removal, enhance-faces, passport-photo) schlugen auf allen Plattformen fehl.
- HEIC-Dateien waren unter ARM defekt (libheif-Symbolkonflikt).
- Die KI-Bundles für Upscale und restore-photo ließen sich unter ARM nicht installieren.
- OCR verwendete auf GPU-Containern die falsche CUDA-Version.
- Umgehung der SSRF-Prüfung über hexadezimale IPv4-gemappte IPv6-Adressen. (Dank an: @tonghuaroot)
- Dekodierung von iPhone-HEIC mit Zusatzbildern. (#183, #199)
- CUDA-OOM bei Real-ESRGAN auf 8-GB-GPUs. (#200)
- 6 Sentry-Fehler aus der Produktion und 7 QA-Fehler. (#208)

### Sicherheit {#security}

- 10 Befunde aus Penetrationstests behoben (XFF-Umgehung, Abstürze durch fehlerhaftes JSON, unbegrenzte Pipelines, XSS im Audit-Protokoll, TRACE-Methode und mehr). (#207)
- Umgehung über hexadezimales IPv6 bei SSRF blockiert. (Dank an: @tonghuaroot)
- Basis-Images im Dockerfile per Digest festgelegt.

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

Live-Demo, Landing-Pages pro Tool und eine Reihe von Feinschliff-Korrekturen.

### Neue Funktionen {#new-features-2}

- **Live-Demo** - [demo.snapotter.com](https://demo.snapotter.com) lässt Menschen SnapOtter ausprobieren, ohne etwas zu installieren.
- **Tool-Indexseite** - Durchsuchen Sie alle 50+ Tools unter `/tools` mit Suche und Kategoriefiltern.
- **50+ SEO-Landing-Pages** - Jedes Tool hat jetzt eine eigene Landing-Page mit FAQs, Anwendungsfällen und Vergleichstabellen.
- **Hintergrundvorschau** - Der Vorher-Nachher-Schieberegler zeigt hinter transparenten Bildern einen Schachbrett-Hintergrund.
- **Generator für starke Passwörter** - Schaltfläche mit einem Klick im Formular Mitglieder hinzufügen.

### Fehlerbehebungen {#bug-fixes-2}

- Das HEIC/HEIF-Info-Tool schlägt nicht mehr fehl (Vordekodierung hinzugefügt).
- Die Installation von KI-Modell-Bundles zeigt bessere Fehlermeldungen und beachtet Ressourcenlimits.
- Bibliotheks-Thumbnails laden korrekt (Auth-Header fehlten).
- Dropdown-Menüs werden in den Einstellungstabellen für Personen und Teams nicht mehr abgeschnitten.
- Der Prozentwert des Größenvergleichs wird bei Tools ohne Komprimierung ausgeblendet.
- Doppelten Link zur Datenschutzerklärung entfernt.
- Italienische Übersetzung für die KI-Funktionseinstellungen hinzugefügt.
- Umbenannte Lucide-Icons aktualisiert (Wand2, Columns).

### Infrastruktur {#infrastructure}

- OpenSSF Scorecard von 4,3 auf ~7,0 gehärtet.
- CI-Tests auf 4 Shards parallelisiert, mit verkleinerten Fixtures.
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

Fünf neue Tools, ein vollständiger Bildeditor, SSO-Anmeldung, 20 Sprachen. Das hätten wahrscheinlich drei getrennte Releases sein sollen, aber so ist es nun.

### Neue Funktionen {#new-features-3}

- **Bildeditor** - Ebenen, Pinsel, Formen, Anpassungen, Filter, Kurven, Tastenkürzel. Läuft in Ihrem Browser, verarbeitet auf Ihrer Hardware.
- **OIDC-/SSO-Authentifizierung** - Melden Sie sich mit Google, GitHub, Okta oder jedem OpenID-Connect-Anbieter an. Setzen Sie ein paar Umgebungsvariablen, und Ihr Team nutzt seine vorhandenen Konten.
- **Meme-Generator** - 100 eingebaute Vorlagen mit Textdarstellung über opentype.js. Oder laden Sie ein eigenes Bild hoch.
- **Beautify** - Legen Sie einen Screenshot ab und erhalten Sie ein aufgewertetes Bild. Geräterahmen (macOS, Windows, Browser), Schatten, Verläufe, Voreinstellungen für soziale Medien.
- **Farbenblindheitssimulation** - Sehen Sie eine Vorschau, wie Bilder bei Protanopie, Deuteranopie, Tritanopie und anderen Farbsehschwächen aussehen.
- **PNG-Transparenzkorrektur** - Erkennt vermeintlich transparente PNGs und korrigiert sie mit BiRefNet HR-Matting. Optionale Wasserzeichenentfernung über LaMa-Inpainting.
- **KI-Canvas-Erweiterung** - Erweitern Sie Bildränder mit KI-Füllung. Drei Qualitätsstufen (schnell, ausgewogen, Qualität), je nachdem, wie viel GPU-Zeit Sie eintauschen möchten.
- **Eraser für mehrere Dateien** - Zeichnen Sie Löschmasken über mehrere Bilder und verarbeiten Sie alle mit einem Klick. Striche bleiben pro Bild erhalten.
- **Import/Export von Pipelines** - Speichern Sie Tool-Ketten als JSON und teilen Sie sie mit anderen.
- **17 neue Kamera-RAW-Formate** über exiftool, dazu Eingabe von QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ und APNG. Neue Ausgabe-Codecs für BMP, ICO, JP2, QOI. Der Export nach AVIF, TIFF, GIF, JXL und PSD wurde aus einem zuvor verlorenen Branch wiederhergestellt.
- **20 Sprachen** - Arabisch, Chinesisch (vereinfacht/traditionell), Tschechisch, Niederländisch, Französisch, Deutsch, Hindi, Indonesisch, Italienisch, Japanisch, Koreanisch, Polnisch, Portugiesisch, Russisch, Spanisch, Thai, Türkisch, Ukrainisch, Vietnamesisch. RTL funktioniert für Arabisch.
- **URL-Import** - Fügen Sie URLs in die Dropzone ein oder importieren Sie sie in großer Zahl aus einer Liste. Abruf auf dem Server mit SSRF-Schutz.

### Verbesserungen {#improvements-2}

- **Bildverbesserung** - Die alte Pipeline durch CLAHE + Normalisierung + Gamma ersetzt. Der neue Schalter Deep Enhance nutzt das KI-Modell für aggressivere Ergebnisse.
- **Foto restaurieren** - Kratzererkennung mit 8-Winkel-Otsu-Filterung neu geschrieben. LaMa-Inpainting läuft jetzt in nativer Auflösung.
- **Exotische Formate überall** - OCR, image-to-PDF, Favicon-Generator, Komposition, Stitch und Vectorize dekodieren jetzt alle HEIC, RAW und PSD.
- **Compress** - Toleranz der Zielgröße von 5 % auf 1 % verengt. Die Zielgröße ist der Standardmodus. Stepper-Schaltflächen und Einheitenauswahl KB/MB hinzugefügt.
- **Sentry-Bereinigung** - 644 nicht handlungsrelevante Ereignisse gefiltert. Echte Fehler werden jetzt korrekt behandelt.
- **GPU-Erkennung** - Bessere Diagnose für Container, in denen CUDA vorhanden ist, nvidia-smi aber nicht.
- **Modus ohne Authentifizierung** - Ein anonymer Benutzer wird mit Administratorrolle in der DB angelegt. API-Schlüssel, Pipelines und Benutzerdateien brechen nicht mehr an FK-Constraints.
- **2.705+ neue Tests** über Unit-, Integrations- und E2E-Tests.

### Fehlerbehebungen {#bug-fixes-3}

- Upscale auf der CPU läuft auf NAS-Geräten und stromsparender Hardware nicht mehr in ein Timeout.
- Das QR-Code-Logo lässt die Vorschau nicht mehr dauerhaft verschwinden.
- Überlauf beim Zuschneiden hoher Hochformatbilder behoben.
- TIFF-Dateien mit Alpha erzwingen korrekt PNG-Ausgabe, statt Beschädigungen zu erzeugen.
- HDR/EXR-Dekodierung konvertiert vor CLAHE in 8 Bit, was Dekodierfehler behebt.
- Eingabepuffer für Gesichtslandmarken werden vor dem Python-Sidecar in PNG konvertiert, was Abstürze behebt.
- Find duplicates verarbeitet Batches mit gemischten Formaten und Netzwerkfehler.
- Die Beautify-Vorschau aktualisiert sich in Echtzeit.
- Fortschrittsbalken für Stitch und Vectorize.
- SVGZ wird von SVG-to-raster verarbeitet.
- Nicht-ASCII-Dateinamen über den prozentkodierten Header X-File-Results korrigiert.

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

Einheitliches Docker-Image mit automatischer GPU-Erkennung. Ein Image bedient CPU- und GPU-Workloads. Compose auf eine einzige Datei mit Log-Rotation vereinfacht. Das Vorab-Herunterladen von Modellen umfasst jetzt Verifizierung und einen Smoke-Test.

---

## v1.13.0 {#v1-13-0}

Rollenbasierte Zugriffskontrolle (RBAC). 14 fein abgestufte Berechtigungen, drei eingebaute Rollen (admin, editor, user), Unterstützung für benutzerdefinierte Rollen. Berechtigungsprüfungen auf allen API-Routen. Tabs im Frontend werden nach Benutzerberechtigungen gefiltert.

---

## v1.12.0 {#v1-12-0}

Tool PDF to Image. Konvertieren Sie PDF-Seiten mit benutzerdefinierter DPI in PNG, JPEG, WebP oder TIFF. Einheitliches Docker-Image mit automatischer GPU-Erkennung.

---

## v1.11.0 {#v1-11-0}

Automatisch erzeugte llms.txt über vitepress-plugin-llms für KI-freundliche Dokumentation.

---

## v1.10.0 {#v1-10-0}

Inhaltsbewusstes Skalieren (Seam Carving) mit Gesichtsschutz. Skalieren Sie Bilder und bewahren Sie dabei wichtige Inhalte.

---

## v1.9.0 {#v1-9-0}

Tool Stitch / Combine. Fügen Sie Bilder nebeneinander, vertikal gestapelt oder in einem benutzerdefinierten Raster zusammen.

---

## v1.8.0 {#v1-8-0}

Tool Edit Metadata. Zeigen Sie EXIF-, IPTC- und XMP-Metadaten an und bearbeiten Sie sie mit einer fein abgestuften Oberfläche zum Entfernen und Behalten.

---

## Ältere Releases {#older-releases}

Das vollständige Änderungsprotokoll auf Commit-Ebene einschließlich Patch-Releases finden Sie unter [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).