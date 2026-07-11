---
description: "Divide l'audio per intervalli di tempo, parti uguali o rilevamento del silenzio."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: caaeaed100a3
---

# Split Audio {#split-audio}

Divide un file audio in segmenti per intervalli di tempo fissi, parti uguali o rilevamento automatico del silenzio. Restituisce un archivio ZIP dei segmenti.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Accetta dati form multipart con un file audio e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | Strategia di divisione: `time`, `parts`, `silence` |
| segmentS | number | No | `60` | Lunghezza del segmento in secondi, da 1 a 3600 (usato quando la mode è `time`) |
| parts | integer | No | `2` | Numero di parti uguali, da 2 a 20 (usato quando la mode è `parts`) |
| thresholdDb | number | No | `-40` | Soglia di silenzio in dB, da -80 a -20 (usato quando la mode è `silence`) |
| minSilenceS | number | No | `0.3` | Intervallo minimo di silenzio in secondi, da 0.1 a 10 (usato quando la mode è `silence`) |

## Example Request {#example-request}

Dividi in segmenti da 30 secondi:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Dividi tramite rilevamento del silenzio:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes {#notes}

- Il `downloadUrl` punta a un archivio ZIP contenente tutti i segmenti.
- Vengono usati solo i parametri rilevanti per la `mode` scelta; gli altri vengono ignorati.
- I nomi dei file dei segmenti sono numerati in sequenza (ad esempio `part-000.mp3`, `part-001.mp3`).
- Il formato di output corrisponde al formato di input.
