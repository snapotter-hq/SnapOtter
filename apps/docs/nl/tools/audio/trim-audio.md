---
description: "Knip een sectie uit een audiobestand door begin- en eindtijden op te geven."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: 77db8552a6d1
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

Knip een sectie uit een audiobestand. Bewaar het deel tussen een begin- en eindtijd, of knip een vast aantal seconden van het begin en het einde af.

In de app accepteren tijdvelden gewone seconden (`90`), `MM:SS` (`1:30`) of `HH:MM:SS` (`1:02:03.5`). De API verwacht seconden.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Accepteert multipart-formulierdata met een audiobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| mode | string | Nee | `range` | `range` bewaart `startS` tot `endS`. `ends` verwijdert `cutStartS` van het begin en `cutEndS` van het einde |
| startS | number | Nee | `0` | Bereikmodus: begintijd in seconden (minimaal 0) |
| endS | number | Bereikmodus | - | Bereikmodus: eindtijd in seconden (moet na begin liggen) |
| cutStartS | number | Nee | `0` | Einden-modus: seconden die van het begin worden verwijderd |
| cutEndS | number | Nee | `0` | Einden-modus: seconden die van het einde worden verwijderd |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Knip de eerste 2 seconden en de laatste 3 seconden af, ongeacht de lengte van het bestand:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Tijden worden opgegeven in seconden en kunnen decimalen bevatten (bijv. `10.5`).
- In de bereikmodus moet `endS` groter zijn dan `startS`. Als `endS` de audioduur overschrijdt, wordt het bestand tot het einde bijgesneden.
- In de einden-modus moet minstens een van `cutStartS` en `cutEndS` boven nul liggen, en samen moeten ze minstens 0,1 seconde audio overlaten. Omdat het afknippen wordt gemeten vanaf de eigen lengte van elk bestand, werkt één instelling voor een batch bestanden met verschillende duur.
- De uitvoer behoudt meestal de invoercontainer. AAC-invoer wordt weggeschreven als M4A, en niet-ondersteunde decodeer-alleen-invoer valt terug op MP3.
