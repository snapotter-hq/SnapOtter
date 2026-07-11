---
description: "Untertiteldateien aus Video-Audiospuren mit KI erzeugen."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 0ded5e0b7ef1
---

# Automatische Untertitel {#auto-subtitles}

Erzeugen Sie Untertiteldateien aus der Audiospur eines Videos mithilfe KI-gestützter Spracherkennung (faster-whisper). Unterstützt automatische Erkennung und 10 explizite Sprachen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Akzeptiert Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings`. Dies ist ein asynchroner Endpunkt - er gibt sofort `202 Accepted` zurück, und der Fortschritt wird über SSE unter `GET /api/v1/jobs/{jobId}/progress` gestreamt.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| language | string | Nein | `"auto"` | Sprache der Sprachaufnahme: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | Nein | `"srt"` | Ausgabeformat der Untertitel: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Dies ist ein KI-Tool, das die Installation des **transcription**-Feature-Bundles erfordert. Wenn das Bundle nicht installiert ist, gibt die API `501 Feature Not Installed` mit Anweisungen zur Installation über die Admin-Oberfläche zurück.
- Die Sprachoption `auto` verwendet die integrierte Spracherkennung von whisper. Die explizite Angabe der Sprache verbessert Genauigkeit und Geschwindigkeit.
- SRT ist das am weitesten unterstützte Untertitelformat. VTT (WebVTT) ist der Standard für Web-Videoplayer.
- Fortschrittsaktualisierungen sind über SSE unter `GET /api/v1/jobs/{jobId}/progress` verfügbar, bis der Job abgeschlossen ist.
