---
description: "Beskär en bild till en centrerad cirkel med transparenta hörn."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 34301e3a503d
---

# Cirkelbeskärning {#circle-crop}

Beskär en bild till en centrerad cirkel med transparenta hörn. Stöder justerbar zoom, förskjutning, kant och utdatastorlek.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| zoom | tal | Nej | `1` | Zoomfaktor (1-5); högre värden beskär tätare |
| offsetX | tal | Nej | `0.5` | Horisontell mittposition (0-1) |
| offsetY | tal | Nej | `0.5` | Vertikal mittposition (0-1) |
| borderWidth | heltal | Nej | `0` | Kantbredd i pixlar (0-200) |
| borderColor | sträng | Nej | `"#ffffff"` | Kantfärg i hex |
| background | sträng | Nej | `"transparent"` | Hörnfyllnad: `"transparent"` eller en hex-färg |
| outputSize | heltal | Nej | - | Slutlig kvadratisk dimension i pixlar (16-4096) |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Anteckningar {#notes}

- Utdata är alltid PNG för att bevara de transparenta hörnen (om inte `background` är satt till en enfärgad färg).
- Cirkeln inskrivs i bildens kortare dimension. Använd `zoom` för att beskära tätare och `offsetX`/`offsetY` för att flytta det synliga området.
- När `outputSize` anges storleksanpassas resultatet till den kvadratiska dimensionen efter beskärningen.
- HEIC-, RAW-, PSD- och SVG-indata avkodas automatiskt före bearbetning.
