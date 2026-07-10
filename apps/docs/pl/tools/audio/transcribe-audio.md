---
description: "Zamienia mowę na tekst dzięki transkrypcji opartej na AI."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 79648d4d6f47
---

# Transcribe Audio {#transcribe-audio}

Zamienia mowę na tekst przy użyciu transkrypcji opartej na AI (faster-whisper). Obsługuje formaty wyjściowe zwykłego tekstu, SRT i VTT z automatycznym lub ręcznym wyborem języka.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| language | string | Nie | `"auto"` | Język: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | Nie | `"txt"` | Format wyjściowy: `txt`, `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

To jest narzędzie asynchroniczne. API natychmiast zwraca `202 Accepted`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Śledź postęp przez SSE pod `GET /api/v1/jobs/{jobId}/progress`. Po zakończeniu zadania strumień SSE dostarcza końcowy wynik z `downloadUrl`.

## Notes {#notes}

- Wymaga zainstalowania pakietu funkcji **transcription**. Zwraca `501` z kodem `FEATURE_NOT_INSTALLED`, brakującym `feature`, `featureName` oraz `estimatedSize`, jeśli pakiet nie jest dostępny.
- Do transkrypcji używa faster-whisper. Język `auto` automatycznie wykrywa mówiony język.
- Formaty `srt` i `vtt` zawierają znaczniki czasu dla każdego segmentu, odpowiednie do napisów.
- Format `txt` zwraca zwykły tekst bez znaczników czasu.
- To jest długotrwałe narzędzie AI; czas przetwarzania zależy od długości audio i sprzętu serwera.
