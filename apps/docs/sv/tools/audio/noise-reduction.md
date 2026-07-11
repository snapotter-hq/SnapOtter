---
description: "Minska bakgrundsljud i ljud med FFT-baserad brusreducering."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: a00ce4a3137c
---

# Noise Reduction {#noise-reduction}

Minska bakgrundsljud i en ljudfil med FFT-baserad brusreducering med valbar styrka.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Accepterar multipart-formulärdata med en ljudfil och ett JSON `settings`-fält.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| strength | string | Nej | `"medium"` | Brusreduceringsstyrka: `light`, `medium`, `strong` |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Anteckningar {#notes}

- `light` bevarar mer detaljer men tar bort mindre brus. `strong` tar bort mer brus men kan introducera subtila artefakter.
- Bäst resultat på inspelningar med konsekvent bakgrundsljud (fläktbrum, luftkonditionering, statiskt brus).
- Utdata behåller vanligtvis inmatningens container. AAC-inmatning skrivs som M4A, och inmatningar som endast kan avkodas och inte stöds faller tillbaka till MP3.
