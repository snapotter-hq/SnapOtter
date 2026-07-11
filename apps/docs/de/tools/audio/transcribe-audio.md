---
description: "Wandelt Sprache mit KI-gestützter Transkription in Text um."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 794ba28482f6
---

# Transcribe Audio {#transcribe-audio}

Wandelt Sprache mithilfe KI-gestützter Transkription (faster-whisper) in Text um. Unterstützt die Ausgabeformate Klartext, SRT und VTT mit automatischer oder manueller Sprachauswahl.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| language | string | Nein | `"auto"` | Sprache: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | Nein | `"txt"` | Ausgabeformat: `txt`, `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

Dies ist ein asynchrones Tool. Die API gibt sofort `202 Accepted` zurück:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Verfolge den Fortschritt per SSE unter `GET /api/v1/jobs/{jobId}/progress`. Sobald der Job abgeschlossen ist, liefert der SSE-Stream das Endergebnis mit einer `downloadUrl`.

## Notes {#notes}

- Erfordert die Installation des Feature-Bundles **transcription**. Gibt `501` mit dem Code `FEATURE_NOT_INSTALLED`, dem fehlenden `feature`, `featureName` und `estimatedSize` zurück, wenn das Bundle nicht verfügbar ist.
- Verwendet faster-whisper für die Transkription. Die Sprache `auto` erkennt die gesprochene Sprache automatisch.
- Die Formate `srt` und `vtt` enthalten Zeitstempel für jedes Segment und eignen sich für Untertitel.
- Das Format `txt` gibt Klartext ohne Zeitstempel zurück.
- Dies ist ein länger laufendes KI-Tool; die Verarbeitungszeit hängt von der Audiolänge und der Server-Hardware ab.
