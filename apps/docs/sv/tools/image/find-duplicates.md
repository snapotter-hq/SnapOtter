---
description: "Upptäck dubbletter och nästan identiska bilder med perceptuell hashning."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 0582f183ee0a
---

# Hitta dubbletter {#find-duplicates}

Ladda upp flera bilder för att upptäcka dubbletter och nästan identiska bilder med perceptuell hashning (dHash). Grupperar liknande bilder tillsammans, identifierar versionen med bäst kvalitet i varje grupp och beräknar potentiella utrymmesbesparingar.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

Tar emot multipart-formulärdata med flera bildfiler och ett valfritt JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| threshold | number | Nej | `8` | Maximalt Hamming-avstånd för att betrakta bilder som dubbletter (0 till 20). Lägre = strängare matchning |

### Filfält {#file-fields}

Ladda upp minst 2 bildfiler i multipart-begäran (alla med fältnamnet `file` eller vilket fältnamn som helst för fildelar).

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Exempelsvar {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Svarsfält {#response-fields}

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| totalImages | number | Antal bilder som analyserats framgångsrikt |
| duplicateGroups | array | Grupper av dubblettbilder |
| uniqueImages | number | Antal bilder som inte ingår i någon dubblettgrupp |
| spaceSaveable | number | Totalt antal byte som kan sparas genom att ta bort dubbletter som inte är bäst |
| skippedFiles | array | Filer som inte kunde bearbetas (med filnamn och orsak) |

### Objekt för dubblettgrupp {#duplicate-group-object}

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| groupId | number | Gruppidentifierare |
| files | array | Bilder i denna dubblettgrupp |

### Filobjekt (inom en grupp) {#file-object-within-a-group}

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| filename | string | Ursprungligt filnamn |
| similarity | number | Likhetsprocent i förhållande till referensbilden (den första i gruppen) |
| width | number | Bildbredd i pixlar |
| height | number | Bildhöjd i pixlar |
| fileSize | number | Filstorlek i byte |
| format | string | Bildformat |
| isBest | boolean | Om detta är versionen med högst kvalitet (flest pixlar, störst fil) |
| thumbnail | string eller null | Base64 JPEG-miniatyr (200px bred) för förhandsvisning |

## Anmärkningar {#notes}

- Använder en 128-bitars dHash (64-bitars rad + 64-bitars kolumn) för perceptuell likhetsdetektering. Detta fångar dubbletter även vid storleksändringar, omkomprimering och mindre redigeringar.
- Tröskelvärdet representerar det maximala Hamming-avståndet mellan hashvärden. Standardvärdet 8 fångar nästan identiska bilder samtidigt som falska positiva undviks. Använd 0 för endast pixelidentiska, eller 15-20 för mycket lös matchning.
- Den "bästa" bilden i varje grupp är den med flest pixlar (bredd x höjd), med filstorlek som avgörande faktor vid lika resultat.
- Minst 2 bilder krävs. Filer som misslyckas med validering eller avkodning rapporteras i `skippedFiles` i stället för att få hela begäran att misslyckas.
- Miniatyrer är 200px breda JPEG-förhandsvisningar kodade som data-URI:er.
- Alla vanliga format stöds (HEIC, RAW, PSD, SVG avkodas automatiskt).
