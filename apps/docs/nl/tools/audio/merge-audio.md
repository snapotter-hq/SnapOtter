---
description: "Combineer meerdere audiobestanden tot één sequentieel spoor."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 883702b2df37
---

# Merge Audio {#merge-audio}

Combineer twee of meer audiobestanden tot één enkel sequentieel spoor, aaneengeschakeld in de volgorde waarin ze worden geüpload.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Accepteert multipart-formuliergegevens met meerdere audiobestanden en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Nee | `"mp3"` | Uitvoerformaat: `mp3`, `wav`, `flac`, `m4a` |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Opmerkingen {#notes}

- Accepteert 2 tot 10 audiobestanden per verzoek.
- Bestanden worden aaneengeschakeld in de uploadvolgorde.
- Alle invoerbestanden worden opnieuw gecodeerd naar het gekozen uitvoerformaat en samplefrequentie voor naadloze samenvoeging.
- Gemengde invoerformaten worden ondersteund (bijv. één WAV en één MP3).
