---
description: "Lägg till in- och uttoningseffekter i ljud."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: e511ff631809
---

# Fade Audio {#fade-audio}

Lägg till in- och uttoningseffekter i början och slutet av en ljudfil.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Accepterar multipart-formulärdata med en ljudfil och ett JSON `settings`-fält.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| fadeInS | number | Nej | `1` | Intoningslängd i sekunder (0 till 30) |
| fadeOutS | number | Nej | `1` | Uttoningslängd i sekunder (0 till 30) |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Anteckningar {#notes}

- Sätt något av värdena till `0` för att hoppa över den toningsriktningen. Minst ett måste vara större än 0.
- Toningslängden begränsas till ljudets längd om den överstiger den.
- Utdata behåller vanligtvis inmatningens container. AAC-inmatning skrivs som M4A, och inmatningar som endast kan avkodas och inte stöds faller tillbaka till MP3.
