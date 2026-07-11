---
description: "Skapa en ringsignalklipp från valfri ljudfil."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 772a5e405a9d
---

# Ringtone Maker {#ringtone-maker}

Skapa ett ringsignalklipp (.m4r) från valfri ljudfil genom att välja en starttid och längd.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Accepterar multipart-formulärdata med en ljudfil och ett JSON `settings`-fält.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| startS | number | Nej | `0` | Starttid i sekunder (minst 0) |
| durationS | number | Nej | `30` | Klippets längd i sekunder (1 till 30) |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Anteckningar {#notes}

- Utdata är alltid M4R-format, kompatibelt med iPhone-ringsignaler.
- Maximal ringsignallängd är 30 sekunder (Apples gräns).
- Vilket ljudformat som helst kan användas som inmatning.
