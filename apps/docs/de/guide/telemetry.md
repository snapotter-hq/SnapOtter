---
description: "Welche anonymen Nutzungsdaten SnapOtter erfasst, wann sie gesendet werden und wie Sie instanzweite Produktanalysen deaktivieren."
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: d31042eb45dd
i18n_hash_version: 2
---

# Was SnapOtter erfasst {#what-snapotter-collects}

Anonyme Produktanalysen sind standardmäßig aktiviert und werden von einem Administrator für die gesamte Instanz festgelegt. Deaktivieren Sie sie unter Einstellungen > System > Datenschutz.

## Ereignisse, die wir senden (wenn aktiviert) {#events-we-send-when-enabled}

- tool_used: Werkzeug-ID, Status, Dauer, Kategorie, ob es ein AI-Werkzeug ist, ein Fehlercode bei Fehlschlag.
- pipeline_executed: Schrittanzahl, Werkzeug-IDs, Batch-Flag, Dateianzahl, Dauer, Status.
- ai_bundle_action: Bündel-ID, Aktion, Dauer.
- Frontend-Nutzung: welche Werkzeugseiten geöffnet werden, hinzugefügte Dateien (nur Anzahl), gestartetes Werkzeug, Downloads, Speicherungen, Suche (nur Ergebnisanzahl), Batch verarbeitet.
- Absturzberichte: Fehlertyp, eine bereinigte Fehlermeldung (Dateinamen, Pfade, E-Mail-Adressen und Werte in Anführungszeichen entfernt), ein Quell-Stack mit Datei-Basisnamen und bei AI-Werkzeugen ein Python-Traceback nur mit Datei-Basisnamen.

## Was wir niemals erfassen {#what-we-never-collect}

- Dateinamen oder Pfade
- Dateiinhalte
- OCR-Ausgabetext
- Bildmetadaten (EXIF)
- Extrahierten Dokumenttext
- Ihre Kontoidentität

PostHog sieht wie jeder Server die IP-Adresse, von der eine Anfrage kommt. Unser PostHog-Projekt verwirft sie, statt sie zu speichern, und die eigenen Server-Ereignisse von SnapOtter senden an ihrer Stelle einen Platzhalter.

## Update-Hinweise {#update-notices}

Solange die Analyse aktiviert ist, fragt der Server alle paar Stunden bei PostHog nach, welche SnapOtter-Version die neueste ist, und nutzt dafür die anonyme ID der Instanz und ihre Version. Gibt es eine neuere Version, sehen Administratoren einen Hinweis mit einem Link zu den Versionshinweisen. Wenn Sie ihn schließen, bleibt er bis zur nächsten Version ausgeblendet. Es wird nichts für Sie installiert oder heruntergeladen, und bei deaktivierter Analyse fragt der Server nie nach.

## Deaktivieren {#turning-it-off}

Admins: Einstellungen > System > Datenschutz, schalten Sie "Anonyme Produktanalysen" aus. Sie stoppt sofort, instanzweit. Um ein Image zu erstellen, das niemals senden kann, setzen Sie das Build-Argument `SNAPOTTER_ANALYTICS=off`.

Um eine neue Instanz mit bereits deaktivierter Analyse zu starten, fügen Sie `SNAPOTTER_ANALYTICS_DEFAULT=off` vor dem ersten Start zur Umgebung des Servers hinzu. Tragen Sie es bei Docker Compose unter `environment:` des App-Dienstes ein, denn ein Eintrag nur in `.env` erreicht den Container nicht.
