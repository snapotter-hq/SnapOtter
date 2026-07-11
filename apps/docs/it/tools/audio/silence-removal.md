---
description: "Elimina le sezioni silenziose da un file audio."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 0224e21cff57
---

# Silence Removal {#silence-removal}

Rileva e rimuove le sezioni silenziose da un file audio in base a una soglia e a una durata minima configurabili.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Accetta dati form multipart con un file audio e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | Soglia di silenzio in dB (da -80 a -20). L'audio al di sotto di questo livello viene considerato silenzio. |
| minSilenceS | number | No | `0.5` | Durata minima del silenzio in secondi da rimuovere (da 0.1 a 5) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Una soglia più alta (meno negativa) è più aggressiva e rimuove anche i passaggi più silenziosi oltre al silenzio vero e proprio.
- Aumenta `minSilenceS` per eliminare solo le pause più lunghe mantenendo i brevi intervalli naturali.
- Utile per ripulire registrazioni di podcast, lezioni e note vocali.
- L'output di solito mantiene il container di input. L'input AAC viene scritto come M4A e gli input non supportati per la sola decodifica ricadono su MP3.
