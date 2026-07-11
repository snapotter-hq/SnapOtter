---
description: "Utwórz klip dzwonka z dowolnego pliku audio."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 226420749f8e
---

# Kreator dzwonków {#ringtone-maker}

Utwórz klip dzwonka (.m4r) z dowolnego pliku audio, wybierając czas rozpoczęcia i czas trwania.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| startS | number | Nie | `0` | Czas rozpoczęcia w sekundach (minimum 0) |
| durationS | number | Nie | `30` | Czas trwania klipu w sekundach (1 do 30) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Uwagi {#notes}

- Wyjście jest zawsze w formacie M4R, zgodnym z dzwonkami iPhone'a.
- Maksymalny czas trwania dzwonka to 30 sekund (limit Apple).
- Jako wejście można użyć dowolnego formatu audio.
