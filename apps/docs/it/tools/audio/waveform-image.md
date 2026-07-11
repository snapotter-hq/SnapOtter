---
description: "Genera una visualizzazione della forma d'onda come immagine PNG da un file audio."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 7219960b7892
---

# Waveform Image {#waveform-image}

Genera una visualizzazione della forma d'onda come immagine PNG da un file audio, con dimensioni e colore configurabili.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Accetta dati form multipart con un file audio e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | Larghezza dell'immagine in pixel (da 256 a 3840) |
| height | integer | No | `256` | Altezza dell'immagine in pixel (da 64 a 1080) |
| color | string | No | `"#4f46e5"` | Colore esadecimale della forma d'onda (ad esempio `"#4f46e5"`) |

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

- L'output è sempre un'immagine PNG, indipendentemente dal formato audio di input.
- La forma d'onda viene renderizzata su uno sfondo trasparente.
- Utile per miniature, anteprime per i social media o l'incorporamento nelle pagine web.
