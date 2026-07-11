---
description: "Gör bakgrunden suddig medan motivet hålls skarpt med hjälp av AI."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: f355ebbe24a7
---

# Suddig bakgrund {#blur-background}

Gör bakgrunden i en bild suddig medan motivet hålls skarpt. AI-modellen isolerar motivet, tillämpar oskärpa på den ursprungliga bakgrunden och komponerar det skarpa motivet överst.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| intensity | heltal | Nej | `50` | Oskärpans intensitet (1-100) |
| feather | heltal | Nej | `0` | Radie för kantutjämning (0-20) |
| format | sträng | Nej | `"png"` | Utdataformat: `png` eller `webp` |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Följ förloppet via SSE på `GET /api/v1/jobs/{jobId}/progress`. När jobbet är klart avger SSE-strömmen en `completed`-händelse med nedladdnings-URL:en.

## Anteckningar {#notes}

- Detta är ett AI-drivet verktyg som returnerar `202 Accepted` och bearbetar asynkront. Anslut till SSE-slutpunkten för att ta emot förloppsuppdateringar och slutresultatet.
- Kräver att funktionspaketet **background-removal** är installerat. Returnerar `501` om paketet inte är tillgängligt.
- Högre intensitetsvärden ger en starkare oskärpeeffekt. Värden över 80 skapar en tydlig bokeh-liknande separation.
- HEIC-, RAW-, PSD- och SVG-indata avkodas automatiskt före bearbetning.
