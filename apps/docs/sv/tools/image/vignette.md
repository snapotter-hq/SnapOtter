---
description: "Lägg till en vinjetteringseffekt med justerbar styrka, färg och position."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: f5e522e7e238
---

# Vinjettering {#vignette}

Lägg till en vinjetteringseffekt som mörknar eller tonar kanterna på en bild. Stöder justerbar styrka, färg, radie, mjukhet, rundhet och centrumposition.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vignette`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | number | No | `0.5` | Vinjetteringens opacitet (0.1-1) |
| color | string | No | `"#000000"` | Vinjetteringens hex-färg |
| radius | integer | No | `70` | Yttre radie som procent av halva diagonalen (0-100) |
| softness | integer | No | `50` | Fjädringens mjukhet (0-100); högre värden ger en mer gradvis övertoning |
| roundness | integer | No | `100` | Form: 100 = cirkel, 0 = ellips som matchar bildens bildförhållande |
| centerX | integer | No | `50` | Horisontell centrumposition som procent (0-100) |
| centerY | integer | No | `50` | Vertikal centrumposition som procent (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Notes {#notes}

- En mindre `radius` mörknar mer av bilden; en större radie begränsar vinjetteringen till de yttersta kanterna.
- Använd en icke-svart `color` (t.ex. vita eller sepiatoner) för kreativa vinjetteringseffekter.
- Att justera `centerX` och `centerY` låter dig placera det klara området utanför mitten, användbart för att rikta fokus mot ett motiv som inte befinner sig i mitten av bildrutan.
- Utdataformatet matchar indataformatet. HEIC, RAW, PSD och SVG-indata avkodas automatiskt före bearbetning.
