---
description: "Konvertera undertextfiler mellan SRT, WebVTT och ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: d47a269e3e22
i18n_hash_version: 2
---

# Konvertera undertexter {#convert-subtitles}

Konvertera en undertextfil mellan SRT, WebVTT och ASS. Tidpunkter och text följer med; ASS-positionering och effekter gör det inte.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Tar emot multipart-formulärdata med en undertextfil (`.srt`, `.vtt` eller `.ass`) och ett valfritt JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Utdataformat: `srt`, `vtt` eller `ass` |
| `encoding` | string | `"auto"` | Textkodning för indata: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` eller `euc-kr` |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Anteckningar {#notes}

- Vid konvertering från ASS behålls tidpunkterna, dialogtexten och den grundläggande formatering som målformatet kan hålla: SRT behåller kursiv, fet stil, färg och teckenstorlek som taggar, och WebVTT behåller kursiv, fet stil och understruken text. Positionering på skärmen, animation och andra ASS-effekter tas bort.
- Utdata är alltid UTF-8. Med `encoding` satt till `auto` läses en fil som är giltig UTF-8 som den är, och allt annat läses som Windows-1252, den vanliga kodningen för äldre västeuropeiska SRT-filer. Om tecken med accent eller icke-latinska tecken blir förvanskade, sätt `encoding` till filens verkliga kodning (till exempel `gb18030` för förenklad kinesiska eller `windows-1251` för kyrilliska).
- Uppladdningar av undertexter är som standard begränsade till 1 MB. Höj eller ta bort gränsen med `MAX_SUBTITLE_SIZE_MB`.
