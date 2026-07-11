---
description: "Mehrere Audiodateien zu einer sequenziellen Spur zusammenführen."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: cb76ca1100aa
---

# Audio zusammenführen {#merge-audio}

Kombiniere zwei oder mehr Audiodateien zu einer einzigen sequenziellen Spur, aneinandergereiht in der Reihenfolge, in der sie hochgeladen werden.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Akzeptiert Multipart-Formulardaten mit mehreren Audiodateien und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| format | string | Nein | `"mp3"` | Ausgabeformat: `mp3`, `wav`, `flac`, `m4a` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Hinweise {#notes}

- Akzeptiert 2 bis 10 Audiodateien pro Anfrage.
- Die Dateien werden in der Upload-Reihenfolge aneinandergereiht.
- Alle Eingabedateien werden für ein nahtloses Zusammenfügen in das gewählte Ausgabeformat und die gewählte Abtastrate neu kodiert.
- Gemischte Eingabeformate werden unterstützt (z. B. eine WAV- und eine MP3-Datei).
