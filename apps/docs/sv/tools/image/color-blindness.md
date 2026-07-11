---
description: "Simulera hur bilder ser ut för personer med olika typer av färgseendebrist."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: e8724cbecda3
---

# Simulering av färgblindhet {#color-blindness-simulation}

Simulera färgseendebrist (CVD) för att förhandsgranska hur bilder ser ut för personer med olika typer av färgblindhet. Användbart för tillgänglighetstestning av design, diagram och gränssnitt.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| simulationType | string | Nej | `"deuteranomaly"` | Typ av färgseendebrist att simulera |

### Simuleringstyper {#simulation-types}

| Värde | Tillstånd | Beskrivning |
|-------|-----------|-------------|
| `protanopia` | Rödblind | Fullständig avsaknad av röda tappar |
| `deuteranopia` | Grönblind | Fullständig avsaknad av gröna tappar |
| `tritanopia` | Blåblind | Fullständig avsaknad av blå tappar |
| `protanomaly` | Rödsvag | Nedsatt känslighet för röda tappar |
| `deuteranomaly` | Grönsvag | Nedsatt känslighet för gröna tappar (vanligast) |
| `tritanomaly` | Blåsvag | Nedsatt känslighet för blå tappar |
| `achromatopsia` | Helt färgblind | Fullständig avsaknad av färgseende |
| `blueConeMonochromacy` | Endast blå tappar | Endast blå tappar fungerar |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Anteckningar {#notes}

- Deuteranomali (grönsvag) är standard eftersom det är den vanligaste formen av färgseendebrist och drabbar ungefär 6 % av män.
- Simuleringen använder färgtransformationsmatriser som modellerar hur nedsatta eller frånvarande fotoreceptortappar förändrar upplevda färger.
- Detta verktyg är icke-destruktivt och genererar endast en förhandsgranskning. Det ändrar inte originalbilden för tillgänglighet.
- Utdataformatet matchar indataformatet. Indata i HEIC, RAW, PSD och SVG avkodas automatiskt före bearbetning.
