---
description: "Byt namn på flera filer med en mönstermall och ladda ner som ZIP."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: 1b6fbb751928
---

# Massbyta namn {#bulk-rename}

Byt namn på flera filer med en mönstermall som har platshållare för index, utfyllt index och ursprungligt filnamn. Returnerar ett ZIP-arkiv som innehåller alla omdöpta filer.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Tar emot multipart-formulärdata med flera filer och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| pattern | sträng | Nej | `"image-{{index}}"` | Namngivningsmönster med platshållare (max 1000 tecken) |
| startIndex | tal | Nej | `1` | Startindexnummer |

### Mönsterplatshållare {#pattern-placeholders}

| Platshållare | Beskrivning | Exempel |
|-------------|-------------|---------|
| `{{index}}` | Löpnummer som börjar från `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Nollutfyllt löpnummer | `01`, `02`, `03` |
| `{{original}}` | Ursprungligt filnamn utan filändelse | `photo`, `IMG_001` |

Den ursprungliga filändelsen bevaras alltid.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Detta ger: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Med ursprungligt filnamn:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Detta ger: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Exempelsvar {#example-response}

Svaret är en ZIP-fil som strömmas direkt (inte ett JSON-svar). Svarshuvudena är:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Anteckningar {#notes}

- Det här verktyget bearbetar inte bilder. Det byter bara namn på filer och paketerar dem i ett ZIP-arkiv.
- Nollutfyllnadsbredden för `{{padded}}` avgörs automatiskt utifrån det totala antalet filer (t.ex. 100 filer skulle använda 3-siffrig utfyllnad: `001`, `002` osv.).
- Filändelser bevaras från de ursprungliga filnamnen.
- Filnamn saneras för att ta bort osäkra tecken.
- Minst en fil måste anges.
