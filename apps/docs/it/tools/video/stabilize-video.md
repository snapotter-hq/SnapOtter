---
description: "Riduci il tremolio della camera con la stabilizzazione a due passaggi."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 90b55c665f7a
---

# Stabilize Video {#stabilize-video}

Riduci il tremolio della camera nelle riprese a mano libera usando la stabilizzazione vidstab a due passaggi di FFmpeg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Accetta dati form multipart con un file video e un campo JSON `settings`. Questo è un endpoint asincrono: restituisce `202 Accepted` immediatamente e l'avanzamento viene trasmesso tramite SSE su `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | Dimensione della finestra di smoothing in fotogrammi (5-60). Valori più alti producono un movimento più fluido |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- La stabilizzazione è un processo a due passaggi: il primo passaggio analizza il movimento della camera e il secondo applica la correzione. Questo richiede circa il doppio del tempo rispetto agli strumenti a passaggio singolo.
- Valori di smoothing più alti rimuovono più tremolio ma possono introdurre un leggero ritaglio con zoom ai bordi.
- Gli aggiornamenti sull'avanzamento sono disponibili tramite SSE su `GET /api/v1/jobs/{jobId}/progress` finché il job non è completato.
