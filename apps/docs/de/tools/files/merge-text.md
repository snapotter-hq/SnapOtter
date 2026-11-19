---
description: "Mehrere Text- oder Markdown-Dateien in der gewählten Reihenfolge zu einer Datei zusammenführen."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 0a83131dd784
i18n_hash_version: 2
---

# Textdateien zusammenführen {#merge-text}

Fügt mehrere Text- oder Markdown-Dateien zu einer einzigen Datei zusammen. Die Dateien werden in der Reihenfolge des Uploads verbunden. Ändern Sie die Reihenfolge daher vor dem Start in der Dateiliste, wenn sie eine Rolle spielt.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

Nimmt Multipart-Formulardaten mit zwei oder mehr Textdateien und einem optionalen JSON-String `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | Was zwischen den Dateien steht: `"blank-line"`, `"rule"` (eine `---`-Zeile) oder `"filename-heading"` (der Name jeder Datei als Überschrift) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Hinweise {#notes}

- Akzeptiert `.txt`-, `.md`-, `.markdown`-, `.csv`- und `.log`-Dateien, zwischen 2 und 50 pro Anfrage.
- Jede Datei muss UTF-8-Text sein. Eine Binärdatei oder eine Datei ohne UTF-8 wird abgelehnt, und ihr Name steht in der Fehlermeldung.
- Haben alle Eingaben dieselbe Endung, behält die Ausgabe sie (`merged.md`, `merged.log`). Gemischte Eingaben ergeben `merged.txt`.
- Mit `filename-heading` verwendet die Markdown-Ausgabe `# name.md`-Überschriften, die Klartext-Ausgabe `==> name.txt <==`-Markierungszeilen.
- Leerzeilen am Ende jeder Datei werden entfernt, damit das Trennzeichen sauber zwischen den Dokumenten sitzt. Eine führende Byte-Order-Mark wird verworfen.
- CSV-Dateien werden als reiner Text verbunden. Verwenden Sie [CSVs zusammenführen](./merge-csvs), um Tabellen mit einer einzigen Kopfzeile zusammenzuführen.
- `.eml`-E-Mail-Dateien werden noch nicht unterstützt.
