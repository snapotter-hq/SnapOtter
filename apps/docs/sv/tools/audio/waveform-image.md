---
description: "Generera en vågformsvisualisering som en PNG-bild från en ljudfil."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 6544e34522a8
---

# Waveform Image {#waveform-image}

Generera en vågformsvisualisering som en PNG-bild från en ljudfil, med konfigurerbara mått och färg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Tar emot multipart-formulärdata med en ljudfil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | Bildbredd i pixlar (256 till 3840) |
| height | integer | No | `256` | Bildhöjd i pixlar (64 till 1080) |
| color | string | No | `"#4f46e5"` | Vågformens hex-färg (t.ex. `"#4f46e5"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- Utdata är alltid en PNG-bild, oavsett indataljudets format.
- Vågformen renderas mot en genomskinlig bakgrund.
- Användbart för miniatyrbilder, förhandsvisningar i sociala medier eller inbäddning på webbsidor.
