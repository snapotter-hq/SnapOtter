---
description: "Welche anonymen Nutzungsdaten SnapOtter erfasst, wann sie gesendet werden, dass sie standardmäßig aktiviert sind und wie ein Administrator die instanzweiten Produktanalysen deaktiviert."
i18n_source_hash: 22d89115c8e5
i18n_provenance: machine
i18n_output_hash: 65691cfc7498
i18n_hash_version: 2
---

# Was SnapOtter erfasst {#what-snapotter-collects}

Anonymous Product Analytics ist auf jeder Instanz standardmäßig aktiviert, ohne Abfrage beim ersten Start. Ein Administrator kann es für die gesamte Instanz unter Settings > System > Privacy deaktivieren, und damit stoppt jeglicher Analyse-Datenverkehr zu PostHog und Sentry.

Wenn die Analyse aktiviert ist, sendet SnapOtter an PostHog, welche Werkzeuge und Pipelines laufen, wie lange sie dauern, ob sie erfolgreich sind, Fehlercodes und Dateianzahlen, zusammen mit der anonymen ID der Instanz, ihrer Version, der CPU-Architektur, dem Betriebssystem, der Installationsart und der Angabe, ob eine GPU vorhanden ist. Absturzberichte gehen an Sentry, wobei Dateinamen, Pfade, E-Mail-Adressen und Werte in Anführungszeichen entfernt werden. Es sendet niemals Ihre Dateien, deren Namen oder Pfade, deren Inhalte, OCR-Ausgaben oder extrahierten Text, Bildmetadaten oder Ihre Kontoidentität. PostHog und Sentry sind die einzigen beiden Ziele, an die etwas gesendet wird, und bei deaktivierter Analyse wird an keines von beiden etwas gesendet.

## Ereignisse, die wir senden (wenn aktiviert) {#events-we-send-when-enabled}

- tool_used: Werkzeug-ID, Status, Dauer, Kategorie, ob es ein AI-Werkzeug ist, ein Fehlercode bei Fehlschlag und der Schrittname bei einem Werkzeug, das eine Phase einzeln meldet (der Analyseschritt von Passport Photo).
- pipeline_executed: Schrittanzahl, Werkzeug-IDs, Batch-Flag, Dateianzahl, Dauer, Status.
- ai_bundle_action: Bündel-ID, Aktion (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment`, `imported`), Dauer und bei einer fehlgeschlagenen Installation eine Fehlerkategorie aus einer festen Liste (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout`, `other`). Installer-Ausgaben, Pfade und Fehlermeldungen werden nie gesendet.
- Frontend-Nutzung: welche Werkzeugseiten geöffnet werden, hinzugefügte Dateien (nur Anzahl), gestartetes Werkzeug, Downloads, Speicherungen, Suche (nur Ergebnisanzahl), Batch verarbeitet.
- Absturzberichte: Fehlertyp, eine bereinigte Fehlermeldung (Dateinamen, Pfade, E-Mail-Adressen und Werte in Anführungszeichen entfernt), ein Quell-Stack mit Datei-Basisnamen und bei AI-Werkzeugen ein Python-Traceback nur mit Datei-Basisnamen.

## Was wir niemals erfassen {#what-we-never-collect}

- Dateinamen oder Pfade
- Dateiinhalte
- OCR-Ausgabetext
- Bildmetadaten (EXIF)
- Extrahierter Dokumenttext
- Ihre Kontoidentität

PostHog sieht wie jeder Server die IP-Adresse, von der eine Anfrage kommt. Unser PostHog-Projekt verwirft sie, statt sie zu speichern, und die eigenen Server-Ereignisse von SnapOtter senden an ihrer Stelle einen Platzhalter.

## Update-Hinweise {#update-notices}

Solange die Analyse aktiviert ist, fragt der Server alle paar Stunden bei PostHog nach, welche SnapOtter-Version die neueste ist, und nutzt dafür die anonyme ID der Instanz und ihre Version. Gibt es eine neuere Version, sehen Administratoren einen Hinweis mit einem Link zu den Versionshinweisen. Wenn Sie ihn schließen, bleibt er bis zur nächsten Version ausgeblendet. Es wird nichts für Sie installiert oder heruntergeladen, und bei deaktivierter Analyse fragt der Server nie nach.

## Deaktivieren {#turning-it-off}

Admins: Settings > System > Privacy, schalten Sie "Anonymous Product Analytics" aus. Die Analyse stoppt sofort, instanzweit, und es wird nichts mehr an PostHog oder Sentry gesendet. Um ein Image zu erstellen, das niemals senden kann, setzen Sie das Build-Argument `SNAPOTTER_ANALYTICS=off`. `SNAPOTTER_TELEMETRY=off` in der Umgebung des Servers bewirkt zur Laufzeit dasselbe, ohne Neubau.

Um eine neue Instanz mit bereits deaktivierter Analyse zu starten, fügen Sie `SNAPOTTER_ANALYTICS_DEFAULT=off` vor dem ersten Start zur Umgebung des Servers hinzu. Tragen Sie es bei Docker Compose unter `environment:` des App-Dienstes ein, denn ein Eintrag nur in `.env` erreicht den Container nicht.
