---
description: "Generuj pliki napisów ze ścieżek dźwiękowych filmów za pomocą AI."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 0f22e0c5dfe6
---

# Auto Subtitles {#auto-subtitles}

Generuj pliki napisów ze ścieżki dźwiękowej filmu za pomocą rozpoznawania mowy opartego na AI (faster-whisper). Obsługuje automatyczne wykrywanie oraz 10 jawnie wskazanych języków.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Przyjmuje dane formularza multipart z plikiem wideo oraz polem JSON `settings`. To punkt końcowy asynchroniczny - zwraca natychmiast `202 Accepted`, a postęp jest strumieniowany przez SSE pod `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Język mowy: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | No | `"srt"` | Format wyjściowy napisów: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- To narzędzie AI, które wymaga zainstalowania pakietu funkcji **transcription**. Jeśli pakiet nie jest zainstalowany, API zwraca `501 Feature Not Installed` z instrukcjami instalacji przez interfejs administratora.
- Opcja języka `auto` używa wbudowanego wykrywania języka whisper. Jawne wskazanie języka poprawia dokładność i szybkość.
- SRT jest najszerzej obsługiwanym formatem napisów. VTT (WebVTT) to standard dla internetowych odtwarzaczy wideo.
- Aktualizacje postępu są dostępne przez SSE pod `GET /api/v1/jobs/{jobId}/progress` do momentu zakończenia zadania.
