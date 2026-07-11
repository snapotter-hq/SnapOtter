---
description: "Trasforma una clip video in una GIF animata."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 9a0752aabe4b
---

# Video to GIF {#video-to-gif}

Trasforma una clip video in una GIF animata con frequenza dei fotogrammi, larghezza, orario di inizio e durata configurabili.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Accetta dati form multipart con un file video e un campo JSON `settings`. Questo è un endpoint asincrono: restituisce `202 Accepted` immediatamente e l'avanzamento viene trasmesso tramite SSE su `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Frequenza dei fotogrammi di output (1-30) |
| width | integer | No | `480` | Larghezza di output in pixel (64-1280). L'altezza scala in modo proporzionale |
| startS | number | No | `0` | Orario di inizio in secondi (deve essere >= 0) |
| durationS | number | No | `5` | Durata in secondi (superiore a 0, massimo 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Valori più bassi di `fps` e `width` producono file GIF più piccoli. Una GIF larga 480px a 12 fps è di solito un buon equilibrio.
- La durata massima è di 60 secondi. Le clip più lunghe producono file molto grandi.
- Gli aggiornamenti sull'avanzamento sono disponibili tramite SSE su `GET /api/v1/jobs/{jobId}/progress` finché il job non è completato.
