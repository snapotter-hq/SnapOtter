---
description: "Snabba upp eller sakta ner ljuduppspelning med en multiplikator."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: 85363372dd2b
---

# Audio Speed {#audio-speed}

Snabba upp eller sakta ner ljuduppspelning genom att tillämpa en hastighetsmultiplikator.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

Accepterar multipart-formulärdata med en ljudfil och ett JSON `settings`-fält.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| factor | number | Nej | `1.5` | Hastighetsmultiplikator (0.25 till 4). Värden under 1 saktar ner; över 1 snabbar upp. |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Anteckningar {#notes}

- En faktor på `0.25` spelar upp i kvartsfart (4x längre). En faktor på `4` spelar upp i fyrdubbel fart (4x kortare).
- Tonhöjden bevaras medan hastigheten ändras (tidssträckning). Använd tonhöjdsskifte för att justera tonhöjden oberoende.
- Utdata behåller vanligtvis inmatningens container. AAC-inmatning skrivs som M4A, och inmatningar som endast kan avkodas och inte stöds faller tillbaka till MP3.
