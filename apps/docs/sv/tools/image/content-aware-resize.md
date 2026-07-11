---
description: "Seam carving-storleksändring som lägger till eller tar bort pixlar längs banor med låg vikt för att bevara viktigt innehåll och ansikten."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: f604ce3f5785
---

# Innehållsmedveten storleksändring {#content-aware-resize}

Seam carving-storleksändring som intelligent tar bort eller lägger till pixlar längs banor med minst visuell betydelse, bevarar viktigt innehåll och skyddar valfritt ansikten.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Bearbetning:** Synkron (returnerar resultatet direkt)

**Modellpaket:** Inget krävs för grundläggande drift. Ansiktsskydd använder paketet `face-detection` (200-300 MB) om det är aktiverat.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bildfil (multipart) |
| width | number | Nej | - | Målbredd i pixlar |
| height | number | Nej | - | Målhöjd i pixlar |
| protectFaces | boolean | Nej | `false` | Upptäck och skydda ansikten från borttagning av sömmar |
| blurRadius | number | Nej | `4` | Oskärperadie i förbearbetningen för energiberäkning (0-20) |
| sobelThreshold | number | Nej | `2` | Tröskelvärde för Sobel-kantdetektering (1-20). Högre värden gör algoritmen mer aggressiv |
| square | boolean | Nej | `false` | Storleksändra till en kvadrat (använder den mindre dimensionen) |

Minst en av `width`, `height` eller `square` måste anges.

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Svar (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Anteckningar {#notes}

- Denna anpassade route returnerar för närvarande ett synkront 200-svar.
- Använder seam carving-biblioteket `caire` för innehållsmedveten storleksändring.
- Minskar endast dimensioner (tar bort sömmar). Kan inte utöka en bild utöver dess ursprungliga storlek.
- Alternativet `protectFaces` använder AI-ansiktsdetektering för att markera ansiktsområden som högenergi, vilket förhindrar att sömmar passerar genom ansikten.
- `blurRadius` styr utjämning före beräkningen av energikartan. Högre värden gör energikartan mer enhetlig, vilket kan hjälpa med brusiga bilder.
- `sobelThreshold` påverkar hur aggressivt kanter upptäcks. Lägre värden bevarar mer subtila kanter.
- Utdatan är alltid i PNG-format.
- Stöder indataformaten HEIC/HEIF, RAW, TGA, PSD, EXR och HDR via automatisk avkodning.
