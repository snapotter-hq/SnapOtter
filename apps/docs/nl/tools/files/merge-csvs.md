---
description: "Combineer meerdere CSV- of TSV-bestanden met overeenkomende kolommen tot één bestand."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: 85de48add86c
---

# CSV's samenvoegen {#merge-csvs}

Combineer meerdere CSV- of TSV-bestanden met overeenkomende kolommen tot één samengevoegd bestand. Alle invoerbestanden moeten dezelfde kolomkoppen hebben.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Accepteert multipart form data met twee of meer CSV-bestanden. Er is geen settings-veld vereist.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Upload 2-20 CSV- of TSV-bestanden met overeenkomende kolomkoppen.

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Opmerkingen {#notes}

- Vereist tussen 2 en 20 invoerbestanden.
- Alle bestanden moeten dezelfde kolomkoppen delen. Het samenvoegen mislukt als de kolommen niet overeenkomen.
- De koprij wordt eenmaal in de uitvoer opgenomen; datarijen uit alle bestanden worden samengevoegd in uploadvolgorde.
- Zowel CSV- als TSV-bestanden worden geaccepteerd, maar alle bestanden in één aanvraag moeten hetzelfde scheidingsteken gebruiken.
