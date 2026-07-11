---
description: "Applicera en pixeleringseffekt på hela bilden eller ett specifikt område."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 769a4985e861
---

# Pixelera {#pixelate}

Applicera en pixeleringseffekt på en hel bild eller ett specifikt rektangulärt område. Användbart för att dölja känsligt innehåll som ansikten, registreringsskyltar eller personlig information.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| blockSize | integer | Nej | `12` | Pixelblockstorlek (2-128); större värden ger grövre pixelering |
| region | object | Nej | - | Begränsa pixeleringen till en rektangel (se nedan) |

### Regionobjekt {#region-object}

| Fält | Typ | Obligatorisk | Beskrivning |
|-------|------|----------|-------------|
| left | integer | Ja | Vänsterförskjutning i pixlar (>= 0) |
| top | integer | Ja | Övre förskjutning i pixlar (>= 0) |
| width | integer | Ja | Regionens bredd i pixlar (>= 1) |
| height | integer | Ja | Regionens höjd i pixlar (>= 1) |

## Exempelförfrågan {#example-request}

Pixelera hela bilden:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Pixelera ett specifikt område:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Anteckningar {#notes}

- När `region` utelämnas pixeleras hela bilden.
- Regionens koordinater anges i pixlar relativt bildens övre vänstra hörn. Regionen måste ligga inom bildens gränser.
- Utdataformatet matchar indataformatet. HEIC-, RAW-, PSD- och SVG-indata avkodas automatiskt före bearbetning.
