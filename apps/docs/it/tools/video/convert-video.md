---
description: "Converti i video tra MP4, MOV, WebM, AVI e MKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: fe6a5a4d5453
---

# Convert Video {#convert-video}

Converti i video tra i formati MP4, MOV, WebM, AVI e MKV con preset di qualità configurabili.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Accetta dati form multipart con un file video e un campo JSON `settings`. Questo è un endpoint asincrono: restituisce `202 Accepted` immediatamente e l'avanzamento viene trasmesso tramite SSE su `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Formato di output: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | Preset di qualità: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Il preset di qualità `high` produce la migliore fedeltà visiva ma file più grandi. Il preset `small` comprime in modo aggressivo per ottenere la dimensione minima del file.
- L'output WebM usa la codifica VP9. MP4 e MOV usano H.264. AVI e MKV sono disponibili per flussi di lavoro legacy o di archiviazione.
- Gli aggiornamenti sull'avanzamento sono disponibili tramite SSE su `GET /api/v1/jobs/{jobId}/progress` finché il job non è completato.
