---
description: "Konwersja wideo między MP4, MOV, WebM, AVI i MKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: d056be982b98
---

# Convert Video {#convert-video}

Konwertuje wideo między formatami MP4, MOV, WebM, AVI i MKV z konfigurowalnymi ustawieniami wstępnymi jakości.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`. To jest endpoint asynchroniczny - zwraca `202 Accepted` natychmiast, a postęp jest przesyłany strumieniowo przez SSE pod `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Nie | `"mp4"` | Format wyjściowy: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | Nie | `"balanced"` | Ustawienie wstępne jakości: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Ustawienie wstępne jakości `high` zapewnia najlepszą wierność wizualną, ale większe pliki. Ustawienie wstępne `small` agresywnie kompresuje, aby uzyskać minimalny rozmiar pliku.
- Wyjście WebM używa kodowania VP9. MP4 i MOV używają H.264. AVI i MKV są dostępne dla starszych lub archiwalnych przepływów pracy.
- Aktualizacje postępu są dostępne przez SSE pod `GET /api/v1/jobs/{jobId}/progress` aż do zakończenia zadania.
