---
description: "Detecteer dubbele en bijna-dubbele afbeeldingen met perceptuele hashing."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 6a8799dc2338
---

# Duplicaten zoeken {#find-duplicates}

Upload meerdere afbeeldingen om duplicaten en bijna-duplicaten te detecteren met perceptuele hashing (dHash). Groepeert vergelijkbare afbeeldingen, identificeert de versie met de beste kwaliteit in elke groep en berekent de potentiële ruimtebesparing.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

Accepteert multipart-formuliergegevens met meerdere afbeeldingsbestanden en een optioneel JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| threshold | number | Nee | `8` | Maximale Hamming-afstand om afbeeldingen als duplicaten te beschouwen (0 tot 20). Lager = strengere matching |

### Bestandsvelden {#file-fields}

Upload minstens 2 afbeeldingsbestanden in het multipart-verzoek (allemaal met de veldnaam `file` of een willekeurige veldnaam voor bestandsonderdelen).

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Voorbeeldantwoord {#example-response}

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

## Antwoordvelden {#response-fields}

| Veld | Type | Beschrijving |
|-------|------|-------------|
| totalImages | number | Aantal succesvol geanalyseerde afbeeldingen |
| duplicateGroups | array | Groepen dubbele afbeeldingen |
| uniqueImages | number | Aantal afbeeldingen dat geen deel uitmaakt van een duplicaatgroep |
| spaceSaveable | number | Totaal aantal bytes dat bespaard kan worden door niet-beste duplicaten te verwijderen |
| skippedFiles | array | Bestanden die niet verwerkt konden worden (met bestandsnaam en reden) |

### Duplicaatgroep-object {#duplicate-group-object}

| Veld | Type | Beschrijving |
|-------|------|-------------|
| groupId | number | Groeps-identifier |
| files | array | Afbeeldingen in deze duplicaatgroep |

### Bestandsobject (binnen een groep) {#file-object-within-a-group}

| Veld | Type | Beschrijving |
|-------|------|-------------|
| filename | string | Oorspronkelijke bestandsnaam |
| similarity | number | Overeenkomstpercentage met de referentieafbeelding (eerste in de groep) |
| width | number | Afbeeldingsbreedte in pixels |
| height | number | Afbeeldingshoogte in pixels |
| fileSize | number | Bestandsgrootte in bytes |
| format | string | Afbeeldingsformaat |
| isBest | boolean | Of dit de versie met de hoogste kwaliteit is (meeste pixels, grootste bestand) |
| thumbnail | string of null | Base64 JPEG-thumbnail (200px breed) voor voorbeeldweergave |

## Opmerkingen {#notes}

- Gebruikt een 128-bits dHash (64-bits rij + 64-bits kolom) voor perceptuele overeenkomstdetectie. Dit vangt duplicaten zelfs bij vergrotingen/verkleiningen, hercompressie en kleine bewerkingen.
- De drempelwaarde vertegenwoordigt de maximale Hamming-afstand tussen hashes. De standaardwaarde van 8 vangt bijna-duplicaten terwijl valse positieven worden vermeden. Gebruik 0 voor alleen pixel-identieke afbeeldingen, of 15-20 voor zeer losse matching.
- De "beste" afbeelding in elke groep is die met de meeste pixels (breedte x hoogte), met de bestandsgrootte als tiebreaker.
- Er zijn minstens 2 afbeeldingen vereist. Bestanden die niet slagen voor validatie of decodering worden gerapporteerd in `skippedFiles` in plaats van dat het hele verzoek mislukt.
- Thumbnails zijn 200px brede JPEG-voorbeelden gecodeerd als data-URI's.
- Alle gangbare formaten worden ondersteund (HEIC, RAW, PSD, SVG worden automatisch gedecodeerd).
