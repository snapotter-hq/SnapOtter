---
description: "Unisci più clip video in un unico file."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: f4e3ea4b4f9f
---

# Merge Videos {#merge-videos}

Unisci più clip video in un unico file MP4. Tutti gli input vengono normalizzati alla risoluzione del primo video e a 30 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Accetta dati form multipart con due o più file video. Questo è un endpoint asincrono: restituisce `202 Accepted` immediatamente e l'avanzamento viene trasmesso tramite SSE su `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

Questo strumento non ha parametri di impostazione. Carica 2-10 file video come più parti `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Le clip vengono concatenate nell'ordine in cui vengono caricate.
- Tutte le clip vengono ricodificate per corrispondere alla risoluzione, alla frequenza dei fotogrammi (30 fps) e al codec (H.264) della prima clip. Gli input non corrispondenti vengono normalizzati automaticamente.
- Accetta 2-10 file video per richiesta.
- Gli aggiornamenti sull'avanzamento sono disponibili tramite SSE su `GET /api/v1/jobs/{jobId}/progress` finché il job non è completato.
