---
description: "Estrai i fotogrammi da un video come ZIP di immagini."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: caa6efde0a74
---

# Video to Frames {#video-to-frames}

Estrai singoli fotogrammi da un video e scaricali come archivio ZIP di immagini PNG o JPG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | Modalità di estrazione: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | Estrai ogni N-esimo fotogramma (2-1000). Usato solo quando mode è `"nth"` |
| timestamps | string | No | `""` | Timestamp separati da virgole in secondi. Richiesto quando mode è `"timestamps"` |
| format | string | No | `"png"` | Formato immagine per i fotogrammi estratti: `png`, `jpg` |

## Example Request {#example-request}

Estrai ogni 30-esimo fotogramma come JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Estrai i fotogrammi a timestamp specifici:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- La modalità `all` estrae ogni fotogramma e può produrre file ZIP molto grandi per i video lunghi. Usa la modalità `nth` o `timestamps` per un'estrazione selettiva.
- PNG conserva la qualità completa ma produce file più grandi. JPG è più piccolo ma con perdita.
- La risposta viene scaricata come archivio ZIP contenente file di immagine numerati in sequenza.
