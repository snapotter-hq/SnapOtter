---
description: "Welche anonymen Nutzungsdaten SnapOtter erfasst, wann sie gesendet werden und wie Sie instanzweite Produktanalysen deaktivieren."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: 80f93f5f790f
---

# Was SnapOtter erfasst {#what-snapotter-collects}

Anonyme Produktanalysen sind standardmäßig aktiviert und werden von einem Administrator für die gesamte Instanz festgelegt. Deaktivieren Sie sie unter Einstellungen > System > Datenschutz.

## Ereignisse, die wir senden (wenn aktiviert) {#events-we-send-when-enabled}

- tool_used: Werkzeug-ID, Status, Dauer, Kategorie, ob es ein AI-Werkzeug ist, ein Fehlercode bei Fehlschlag.
- pipeline_executed: Schrittanzahl, Werkzeug-IDs, Batch-Flag, Dateianzahl, Dauer, Status.
- ai_bundle_action: Bündel-ID, Aktion, Dauer.
- Frontend-Nutzung: welche Werkzeugseiten geöffnet werden, hinzugefügte Dateien (nur Anzahl), gestartetes Werkzeug, Downloads, Speicherungen, Suche (nur Ergebnisanzahl), Batch verarbeitet.
- Absturzberichte: Fehlertyp und ein Quell-Stack nur mit Datei-Basisnamen.

## Was wir niemals erfassen {#what-we-never-collect}

- Dateinamen oder Pfade
- Dateiinhalte
- OCR-Ausgabetext
- Bildmetadaten (EXIF)
- Extrahierten Dokumenttext
- Ihre IP-Adresse oder Kontoidentität

## Deaktivieren {#turning-it-off}

Admins: Einstellungen > System > Datenschutz, schalten Sie "Anonyme Produktanalysen" aus. Sie stoppt sofort, instanzweit. Um ein Image zu erstellen, das niemals senden kann, setzen Sie das Build-Argument `SNAPOTTER_ANALYTICS=off`.
