---
description: "Konvertiert Untertiteldateien zwischen SRT, WebVTT und ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 6c23cb74ef5e
i18n_hash_version: 2
---

# Untertitel konvertieren {#convert-subtitles}

Konvertiert eine Untertiteldatei zwischen SRT, WebVTT und ASS. Timing und Text bleiben erhalten, ASS-Positionierung und -Effekte nicht.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Akzeptiert Multipart-Formulardaten mit einer Untertiteldatei (`.srt`, `.vtt` oder `.ass`) und einem optionalen JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Ausgabeformat: `srt`, `vtt` oder `ass` |
| `encoding` | string | `"auto"` | Textkodierung der Eingabe: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` oder `euc-kr` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notes {#notes}

- Bei der Konvertierung aus ASS bleiben Timing, Dialogtext und die grundlegende Formatierung erhalten, die das Zielformat abbilden kann: SRT behält Kursiv, Fett, Farbe und Schriftgröße als Tags, WebVTT behält Kursiv, Fett und Unterstreichung. Positionierung auf dem Bildschirm, Animationen und andere ASS-Effekte entfallen.
- Die Ausgabe ist immer UTF-8. Ist `encoding` auf `auto` gesetzt, wird eine gültige UTF-8-Datei unverändert gelesen und alles andere als Windows-1252, die übliche Kodierung älterer westeuropäischer SRT-Dateien. Erscheinen Akzente oder nicht-lateinische Zeichen verstümmelt, setze `encoding` auf die tatsächliche Kodierung der Datei (zum Beispiel `gb18030` für vereinfachtes Chinesisch oder `windows-1251` für Kyrillisch).
- Untertitel-Uploads sind standardmäßig auf 1 MB begrenzt. Du kannst die Grenze mit `MAX_SUBTITLE_SIZE_MB` anheben oder entfernen.
