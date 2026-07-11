---
description: "Hintergrundgeräusche in Audio mit FFT-basierter Rauschunterdrückung reduzieren."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 63361532a98f
---

# Rauschunterdrückung {#noise-reduction}

Reduziere Hintergrundgeräusche in einer Audiodatei mit FFT-basierter Rauschunterdrückung mit wählbarer Stärke.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| strength | string | Nein | `"medium"` | Stärke der Rauschunterdrückung: `light`, `medium`, `strong` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Hinweise {#notes}

- `light` bewahrt mehr Details, entfernt aber weniger Rauschen. `strong` entfernt mehr Rauschen, kann aber subtile Artefakte einführen.
- Beste Ergebnisse bei Aufnahmen mit gleichmäßigem Hintergrundgeräusch (Lüfterbrummen, Klimaanlage, Rauschen).
- Die Ausgabe behält üblicherweise den Eingabecontainer bei. AAC-Eingabe wird als M4A geschrieben, und nicht unterstützte Nur-Dekodier-Eingaben fallen auf MP3 zurück.
