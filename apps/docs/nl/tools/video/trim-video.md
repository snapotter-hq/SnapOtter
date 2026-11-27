---
description: "Een clip uit een video knippen door start- en eindtijden op te geven."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: e9fbf1fb8349
i18n_hash_version: 2
---

# Trim Video {#trim-video}

Knip een clip uit een video. Bewaar het deel tussen een start- en eindtijd, of knip een vaste hoeveelheid van het begin en het einde af. Er is een optie voor frame-nauwkeurige knippen.

In de app accepteren tijdvelden gewone seconden (`90`), `MM:SS` (`1:30`) of `HH:MM:SS` (`1:02:03.5`). De API accepteert seconden.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` behoudt `startS` tot `endS`. `ends` verwijdert `cutStartS` van het begin en `cutEndS` van het einde |
| startS | number | No | `0` | Range mode: starttijd in seconden (moet >= 0 zijn) |
| endS | number | Range mode | - | Range mode: eindtijd in seconden (moet na startS liggen) |
| cutStartS | number | No | `0` | Ends mode: seconden die van het begin worden verwijderd |
| cutEndS | number | No | `0` | Ends mode: seconden die van het einde worden verwijderd |
| precise | boolean | No | `false` | Het hele bereik opnieuw encoderen voor exacte begin- en eindframes in plaats van kopiëren vanaf de volgende keyframe |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Knip de eerste 5 seconden en de laatste 10 seconden af, ongeacht de lengte van de video:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Wanneer `precise` `false` is (de standaard), begint de clip op precies het gevraagde frame. Alleen de frames tussen dat beginpunt en de volgende keyframe worden opnieuw geëncodeerd en de rest wordt gekopieerd, zodat het snel blijft. Het einde kan een frame of zo te lang doorlopen, omdat een gekopieerde stream de frames behoudt waarvan eerdere frames afhangen. Bronnen die hiermee niet veilig te splitsen zijn (10-bit of geïnterlinieerde H.264, andere codecs die een opnieuw geëncodeerd begin nodig hebben, of AVI-, FLV-, MPEG- en TS-bestanden) worden in plaats daarvan volledig opnieuw geëncodeerd.
- `precise` instellen op `true` encodeert altijd het hele bereik opnieuw, zodat beide uiteinden exact zijn, maar het duurt langer.
- In range mode moet `endS` groter zijn dan `startS`. Als `endS` voorbij het einde van de video ligt, loopt de clip door tot het einde.
- In ends mode moet minstens een van `cutStartS` en `cutEndS` groter dan nul zijn, en samen moeten ze een deel van de video overlaten. Omdat het knippen wordt gemeten vanaf de eigen lengte van elk bestand, werkt een instelling voor een batch video's met verschillende duur.
