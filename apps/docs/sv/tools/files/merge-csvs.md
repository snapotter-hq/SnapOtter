---
description: "Kombinera flera CSV- eller TSV-filer med matchande kolumner till en enda."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: a3543f8ce827
---

# Slå samman CSV-filer {#merge-csvs}

Kombinera flera CSV- eller TSV-filer med matchande kolumner till en enda sammanslagen fil. Alla indatafiler måste ha samma kolumnrubriker.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Tar emot multipart-formulärdata med två eller fler CSV-filer. Inget settings-fält krävs.

## Parametrar {#parameters}

Det här verktyget har inga konfigurerbara parametrar. Ladda upp 2-20 CSV- eller TSV-filer med matchande kolumnrubriker.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Anteckningar {#notes}

- Kräver mellan 2 och 20 indatafiler.
- Alla filer måste ha samma kolumnrubriker. Sammanslagningen misslyckas om kolumnerna inte matchar.
- Rubrikraden inkluderas en gång i utdata; datarader från alla filer sammanfogas i uppladdningsordning.
- Både CSV- och TSV-filer godtas, men alla filer i en enda förfrågan bör använda samma avgränsare.
