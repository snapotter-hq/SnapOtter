---
description: "Riduci la dimensione del file video con il controllo della qualità."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: 849516d8c0a4
---

# Compress Video {#compress-video}

Riduci la dimensione del file video usando una forza di compressione configurabile e un ridimensionamento opzionale della risoluzione.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Accetta dati form multipart con un file video e un campo JSON `settings`. Questo è un endpoint asincrono: restituisce `202 Accepted` immediatamente e l'avanzamento viene trasmesso tramite SSE su `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Forza di compressione: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | Risoluzione di output: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Il preset `light` conserva una qualità quasi originale. Il preset `strong` riduce la dimensione del file in modo aggressivo a scapito della fedeltà visiva.
- Ridurre la risoluzione (ad es. da 4K a 720p) si somma alla compressione per una riduzione significativa delle dimensioni.
- Gli aggiornamenti sull'avanzamento sono disponibili tramite SSE su `GET /api/v1/jobs/{jobId}/progress` finché il job non è completato.
