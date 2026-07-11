---
description: "Zet spraak om naar tekst met AI-gestuurde transcriptie."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 658675dcd938
---

# Transcribe Audio {#transcribe-audio}

Zet spraak om naar tekst met AI-gestuurde transcriptie (faster-whisper). Ondersteunt platte tekst, SRT en VTT als uitvoerformaten met automatische of handmatige taalkeuze.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Accepteert multipart-formulierdata met een audiobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| language | string | Nee | `"auto"` | Taal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | Nee | `"txt"` | Uitvoerformaat: `txt`, `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

Dit is een asynchrone tool. De API retourneert direct `202 Accepted`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Volg de voortgang via SSE op `GET /api/v1/jobs/{jobId}/progress`. Wanneer de taak is voltooid, levert de SSE-stream het eindresultaat met een `downloadUrl`.

## Notes {#notes}

- Vereist dat het **transcription**-featurebundel is geïnstalleerd. Retourneert `501` met code `FEATURE_NOT_INSTALLED`, de ontbrekende `feature`, `featureName` en `estimatedSize` als het bundel niet beschikbaar is.
- Gebruikt faster-whisper voor transcriptie. Taal `auto` detecteert de gesproken taal automatisch.
- De formaten `srt` en `vtt` bevatten tijdstempels voor elk segment, geschikt voor ondertitels.
- Het formaat `txt` retourneert platte tekst zonder tijdstempels.
- Dit is een langlopende AI-tool; de verwerkingstijd hangt af van de audiolengte en de serverhardware.
