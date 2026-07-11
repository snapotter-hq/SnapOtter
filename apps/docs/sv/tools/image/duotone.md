---
description: "Applicera en tvåfärgad duotone-effekt med anpassade skugg- och högdagerfärger."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: 26a4972c53e9
---

# Duotone {#duotone}

Applicera en tvåfärgad duotone-effekt på en bild. Bilden konverteras till gråskala och mappas sedan till en gradient mellan skuggfärgen (mörka toner) och högdagerfärgen (ljusa toner).

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| shadow | string | Nej | `"#1e3a8a"` | Skugghexfärg (tillämpas på mörka toner) |
| highlight | string | Nej | `"#fbbf24"` | Högdagerhexfärg (tillämpas på ljusa toner) |
| intensity | integer | Nej | `100` | Effektintensitet (0-100); 0 returnerar originalet, 100 tillämpar hela duotonen |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Anteckningar {#notes}

- Utdataformatet matchar indataformatet. Indata i HEIC, RAW, PSD och SVG avkodas automatiskt före bearbetning.
- Ett `intensity` under 100 blandar duotone-resultatet med originalbilden, vilket möjliggör subtilare effekter.
- Populära duotone-kombinationer inkluderar marinblå/guld, turkos/korall och lila/rosa.
