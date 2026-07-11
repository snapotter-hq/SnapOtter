---
description: "Einen Bereich aus einem Video ausschneiden."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: 0f90623074bc
---

# Crop Video {#crop-video}

Einen rechteckigen Bereich aus einem Video ausschneiden, indem Größe und Position des Bereichs angegeben werden.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | Breite des Zuschneidebereichs in Pixeln (Minimum 16) |
| height | integer | Yes | - | Höhe des Zuschneidebereichs in Pixeln (Minimum 16) |
| x | integer | No | `0` | Horizontaler Versatz von der oberen linken Ecke |
| y | integer | No | `0` | Vertikaler Versatz von der oberen linken Ecke |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- Der Zuschneidebereich muss innerhalb der Videoabmessungen liegen. Wenn `x + width` oder `y + height` die Quellgröße überschreitet, gibt die Anfrage einen 400-Fehler zurück.
- Die minimale Zuschneidegröße beträgt 16x16 Pixel.
- Abmessungen werden auf gerade Zahlen gerundet, wie es die meisten Videocodecs erfordern.
