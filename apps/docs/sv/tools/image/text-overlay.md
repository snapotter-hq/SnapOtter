---
description: "Lägg till stilsatta textöverlägg med slagskuggor och bakgrundsrutor."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 3761aa416973
---

# Textöverlägg {#text-overlay}

Lägg till stilsatt text på bilder med valfri slagskugga och halvgenomskinlig bakgrundsruta. Lämpligt för titlar, bildtexter eller anteckningar på foton.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Text att lägga över (1 till 500 tecken) |
| fontSize | number | No | `48` | Teckenstorlek i pixlar (8 till 200) |
| color | string | No | `"#FFFFFF"` | Textfärg i hex-format (`#RRGGBB`) |
| position | string | No | `"bottom"` | Vertikal placering: `top`, `center`, `bottom` |
| backgroundBox | boolean | No | `false` | Visa en halvgenomskinlig bakgrundsrektangel bakom texten |
| backgroundColor | string | No | `"#000000"` | Bakgrundsruteens färg i hex-format (`#RRGGBB`) |
| shadow | boolean | No | `true` | Lägg till en slagskugga bakom texten |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

Med en bakgrundsruta:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- Text centreras alltid horisontellt i bilden.
- Slagskuggan använder en 2px förskjutning med 3px oskärpa vid 70 % svart opacitet.
- Bakgrundsrutan täcker hela bildbredden vid 70 % opacitet, med höjd proportionell mot teckenstorleken (1,8x).
- Text renderas via SVG-komposit, så systemets standardteckensnitt utan seriffer används.
- XML-specialtecken i texten escapas säkert.
- Utdataformatet matchar indataformatet. HEIC, RAW, PSD och SVG-indata avkodas automatiskt före bearbetning.
