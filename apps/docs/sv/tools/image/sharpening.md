---
description: "Skärp bilder med adaptiva metoder, oskarp mask eller högpass, med valfri brusreducering."
i18n_source_hash: ccb60af9faae
i18n_provenance: human
i18n_output_hash: ddc9e7b2c36e
---

# Skärpning {#sharpening}

Avancerat skärpningsverktyg med tre metoder: adaptiv (smart kantmedveten), oskarp mask (klassisk radie/mängd) och högpass (texturbetoning). Innehåller inbyggd brusreducering för att förhindra skärpningsartefakter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| method | string | No | `"adaptive"` | Skärpningsalgoritm: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | No | `1.0` | Adaptiv: Gaussisk sigma (0.5 till 10) |
| m1 | number | No | `1.0` | Adaptiv: skärpning i plana områden (0 till 10) |
| m2 | number | No | `3.0` | Adaptiv: skärpning i ojämna områden (0 till 20) |
| x1 | number | No | `2.0` | Adaptiv: tröskel plana/ojämna (0 till 10) |
| y2 | number | No | `12` | Adaptiv: maximal skärpning i plana områden (0 till 50) |
| y3 | number | No | `20` | Adaptiv: maximal skärpning i ojämna områden (0 till 50) |
| amount | number | No | `100` | Oskarp mask: skärpningsmängd (0 till 1000) |
| radius | number | No | `1.0` | Oskarp mask: oskärperadie i pixlar (0.1 till 5) |
| threshold | number | No | `0` | Oskarp mask: minsta ljusstyrkeskillnad för att skärpa (0 till 255) |
| strength | number | No | `50` | Högpass: filterstyrka (0 till 100) |
| kernelSize | number | No | `3` | Högpass: storlek på faltningskärna (3 eller 5) |
| denoise | string | No | `"off"` | Brusreducering före skärpning: `off`, `light`, `medium`, `strong` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Oskarp mask med tröskel för att skydda jämna områden:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Notes {#notes}

- Endast parametrar som är relevanta för den valda metoden används. Till exempel ignoreras `amount`, `radius` och `threshold` när `method` är `adaptive`.
- Den adaptiva metoden använder Sharps inbyggda adaptiva skärpning med konfigurerbart beteende för plana/ojämna områden.
- Alternativet `denoise` tillämpar brusreducering före skärpning för att förhindra förstärkning av brus/korn.
- Högpasskärpning extraherar fina detaljer genom att subtrahera en oskarp version från originalet och sedan blanda tillbaka.
- Utdataformatet matchar indataformatet. HEIC, RAW, PSD och SVG-indata avkodas automatiskt före bearbetning.
