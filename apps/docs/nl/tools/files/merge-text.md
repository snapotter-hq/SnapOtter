---
description: "Voeg meerdere tekst- of Markdown-bestanden in de door jou gekozen volgorde samen tot één bestand."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 90d2a9218df8
i18n_hash_version: 2
---

# Tekstbestanden samenvoegen {#merge-text}

Voeg meerdere tekst- of Markdown-bestanden samen tot één bestand. De bestanden worden in uploadvolgorde aan elkaar gezet, dus wijzig de volgorde in de bestandslijst voordat je start als de volgorde ertoe doet.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

Accepteert multipart-formuliergegevens met twee of meer tekstbestanden en een optionele JSON-tekenreeks `settings`.

## Parameters {#parameters}

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | Wat tussen de bestanden komt: `"blank-line"`, `"rule"` (een `---`-regel) of `"filename-heading"` (de naam van elk bestand als kop) |

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Opmerkingen {#notes}

- Accepteert `.txt`-, `.md`-, `.markdown`-, `.csv`- en `.log`-bestanden, tussen 2 en 50 per aanvraag.
- Elk bestand moet UTF-8-tekst zijn. Een binair bestand of een bestand zonder UTF-8 wordt geweigerd, met de naam in de foutmelding.
- Als alle invoerbestanden dezelfde extensie hebben, behoudt de uitvoer die (`merged.md`, `merged.log`). Gemengde invoer levert `merged.txt` op.
- Met `filename-heading` gebruikt Markdown-uitvoer `# name.md`-koppen; platte-tekstuitvoer gebruikt `==> name.txt <==`-markeringsregels.
- Lege regels aan het einde van elk bestand worden weggesneden, zodat het scheidingsteken netjes tussen de documenten staat. Een byte-order mark aan het begin wordt weggelaten.
- CSV-bestanden worden als platte tekst samengevoegd. Gebruik [CSV's samenvoegen](./merge-csvs) om tabellen met één koprij te combineren.
- `.eml`-e-mailbestanden worden nog niet ondersteund.
