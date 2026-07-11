---
description: "Verklein de bestandsgrootte van afbeeldingen op basis van kwaliteitsniveau of naar een doelbestandsgrootte."
i18n_source_hash: af4685da7e64
i18n_provenance: human
i18n_output_hash: c556a6d13f9f
---

# Comprimeren {#compress}

Verklein de bestandsgrootte van afbeeldingen door een kwaliteitsniveau of een doelbestandsgrootte in kilobytes op te geven. De tool gebruikt iteratieve binaire zoekopdrachten om doelgroottes nauwkeurig te bereiken.

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/compress`

Accepteert multipart-formuliergegevens met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| mode | string | Nee | `"quality"` | Compressiemodus: `quality` of `targetSize` |
| quality | number | Nee | `80` | Kwaliteitsniveau (1-100). Gebruikt wanneer de modus `quality` is. |
| targetSizeKb | number | Nee | - | Doelbestandsgrootte in kilobytes. Gebruikt wanneer de modus `targetSize` is. |

## Voorbeeldverzoek {#example-request}

Comprimeren naar kwaliteit 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Comprimeren naar een doelgrootte van 200 KB:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Opmerkingen {#notes}

- In de modus `quality` leveren lagere waarden kleinere bestanden op met meer compressieartefacten. Een waarde van 80 is een goede standaard voor webgebruik.
- In de modus `targetSize` voert de engine iteratieve compressie uit om zo dicht mogelijk bij het doel te komen zonder dit te overschrijden.
- Het uitvoerformaat komt overeen met het invoerformaat. De compressie wordt toegepast op de eigen codering van het formaat (bijv. JPEG-kwaliteit voor JPEG-bestanden, WebP-kwaliteit voor WebP-bestanden).
- Als de standaardkwaliteit (80) acceptabel is, kun je de parameter `quality` volledig weglaten.
