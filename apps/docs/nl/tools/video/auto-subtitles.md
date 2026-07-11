---
description: "Genereer ondertitelbestanden uit de audiotracks van video's met AI."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 24377bd16df5
---

# Auto Subtitles {#auto-subtitles}

Genereer ondertitelbestanden uit de audiotrack van een video met AI-gedreven spraakherkenning (faster-whisper). Ondersteunt automatische detectie en 10 expliciete talen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Accepteert multipart-formuliergegevens met een videobestand en een JSON-veld `settings`. Dit is een asynchroon endpoint - het geeft `202 Accepted` direct terug en de voortgang wordt gestreamd via SSE op `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| language | string | Nee | `"auto"` | Spraaktaal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | Nee | `"srt"` | Uitvoerformaat voor ondertitels: `srt`, `vtt` |

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

- Dit is een AI-hulpmiddel dat vereist dat de **transcription**-functiebundel is geïnstalleerd. Als de bundel niet is geïnstalleerd, geeft de API `501 Feature Not Installed` terug met instructies om deze via de admin-UI te installeren.
- De taaloptie `auto` gebruikt de ingebouwde taaldetectie van whisper. Het expliciet opgeven van de taal verbetert de nauwkeurigheid en snelheid.
- SRT is het meest breed ondersteunde ondertitelformaat. VTT (WebVTT) is de standaard voor webvideospelers.
- Voortgangsupdates zijn beschikbaar via SSE op `GET /api/v1/jobs/{jobId}/progress` totdat de taak is voltooid.
