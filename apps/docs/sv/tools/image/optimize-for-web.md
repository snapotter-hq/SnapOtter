---
description: "Optimera bilder för webbleverans med formatkonvertering, kvalitetskontroll, storleksändring och borttagning av metadata."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 797dfa090fa6
---

# Optimera för webb {#optimize-for-web}

Optimera bilder för webbleverans i ett enda steg. Kombinerar formatkonvertering, kvalitetsjustering, valfri storleksändring, progressiv kodning och borttagning av metadata.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

En slutpunkt för direktförhandsvisning finns också på `POST /api/v1/tools/image/optimize-for-web/preview`, som returnerar den bearbetade bilden direkt som binärdata (ingen arbetsyta skapas) för justering av parametrar i realtid.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| format | string | Nej | `"webp"` | Utdataformat: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | Nej | `80` | Utdatakvalitet (1-100) |
| maxWidth | number | Nej | - | Maximal bredd i pixlar. Bilden skalas ned om den är bredare. |
| maxHeight | number | Nej | - | Maximal höjd i pixlar. Bilden skalas ned om den är högre. |
| progressive | boolean | Nej | `true` | Aktivera progressiv/sammanflätad kodning |
| stripMetadata | boolean | Nej | `true` | Ta bort EXIF-, GPS-, ICC- och XMP-metadata |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Optimera för AVIF med aggressiv komprimering:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Svar från förhandsvisningsslutpunkten {#preview-endpoint-response}

Förhandsvisningsslutpunkten (`/api/v1/tools/image/optimize-for-web/preview`) returnerar den binära bilden direkt med informationsrubriker:

- `X-Original-Size` - Ursprunglig filstorlek i byte
- `X-Processed-Size` - Bearbetad filstorlek i byte
- `X-Output-Filename` - URL-kodat utdatafilnamn

## Anteckningar {#notes}

- Detta verktyg är utformat som en komplett optimeringspipeline för webbtillgångar. Det hanterar formatkonvertering, kvalitetsjustering, maxdimensionsbegränsning och borttagning av metadata i ett enda pass.
- Utdatafilnamnets filändelse uppdateras för att matcha det valda formatet.
- JXL-kodning (JPEG XL) använder en specialiserad CLI-kodare. Bilden bearbetas först som PNG och kodas sedan till JXL.
- Progressiv kodning förbättrar den upplevda inläsningstiden för JPEG och PNG genom att låta webbläsare rendera en förhandsvisning med låg kvalitet innan hela bilden läses in.
- Förhandsvisningsslutpunkten är lättare (ingen arbetsyta/jobb skapas) och är avsedd för frontendens användargränssnitt för justering av parametrar i realtid.
