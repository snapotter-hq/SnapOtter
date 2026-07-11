---
description: "Genera file di sottotitoli dalle tracce audio dei video usando l'IA."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 79ae76ae407c
---

# Sottotitoli automatici {#auto-subtitles}

Genera file di sottotitoli dalla traccia audio di un video usando il riconoscimento vocale basato sull'IA (faster-whisper). Supporta il rilevamento automatico e 10 lingue esplicite.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Accetta dati di form multipart con un file video e un campo JSON `settings`. Questo è un endpoint asincrono: restituisce `202 Accepted` immediatamente e l'avanzamento viene trasmesso in streaming tramite SSE su `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Lingua del parlato: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | No | `"srt"` | Formato di output dei sottotitoli: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Questo è uno strumento IA che richiede l'installazione del bundle della funzionalità **transcription**. Se il bundle non è installato, l'API restituisce `501 Feature Not Installed` con le istruzioni per installarlo tramite l'interfaccia di amministrazione.
- L'opzione lingua `auto` usa il rilevamento automatico della lingua integrato in whisper. Specificare la lingua in modo esplicito migliora l'accuratezza e la velocità.
- SRT è il formato di sottotitoli più ampiamente supportato. VTT (WebVTT) è lo standard per i lettori video web.
- Gli aggiornamenti sull'avanzamento sono disponibili tramite SSE su `GET /api/v1/jobs/{jobId}/progress` fino al completamento del job.
