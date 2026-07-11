---
description: "Converte il parlato in testo con trascrizione basata su AI."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 654e18766567
---

# Transcribe Audio {#transcribe-audio}

Converte il parlato in testo usando la trascrizione basata su AI (faster-whisper). Supporta formati di output in testo semplice, SRT e VTT con selezione della lingua automatica o manuale.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Accetta dati form multipart con un file audio e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Lingua: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | No | `"txt"` | Formato di output: `txt`, `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

Questo è uno strumento asincrono. L'API restituisce `202 Accepted` immediatamente:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Monitora l'avanzamento tramite SSE su `GET /api/v1/jobs/{jobId}/progress`. Al completamento del job, lo stream SSE fornisce il risultato finale con un `downloadUrl`.

## Notes {#notes}

- Richiede l'installazione del feature bundle **transcription**. Restituisce `501` con codice `FEATURE_NOT_INSTALLED`, il `feature` mancante, `featureName` e `estimatedSize` se il bundle non è disponibile.
- Usa faster-whisper per la trascrizione. La lingua `auto` rileva automaticamente la lingua parlata.
- I formati `srt` e `vtt` includono i timestamp per ogni segmento, adatti ai sottotitoli.
- Il formato `txt` restituisce testo semplice senza timestamp.
- Questo è uno strumento AI a lunga esecuzione; il tempo di elaborazione dipende dalla lunghezza dell'audio e dall'hardware del server.
