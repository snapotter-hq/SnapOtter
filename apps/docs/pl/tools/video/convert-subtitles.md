---
description: "Konwertuje pliki napisów między SRT, WebVTT i ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 50229a18f89f
i18n_hash_version: 2
---

# Convert Subtitles {#convert-subtitles}

Konwertuje plik napisów między SRT, WebVTT i ASS. Czas i tekst zostają zachowane; pozycjonowanie i efekty ASS nie.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Przyjmuje dane formularza multipart z jednym plikiem napisów (`.srt`, `.vtt` lub `.ass`) i opcjonalnym polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Format wyjściowy: `srt`, `vtt` lub `ass` |
| `encoding` | string | `"auto"` | Kodowanie tekstu wejściowego: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` lub `euc-kr` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notes {#notes}

- Konwersja z ASS zachowuje czas, tekst dialogów i podstawowe formatowanie, które potrafi przechować format docelowy: SRT zachowuje kursywę, pogrubienie, kolor i rozmiar czcionki jako znaczniki, a WebVTT zachowuje kursywę, pogrubienie i podkreślenie. Pozycjonowanie na ekranie, animacje i pozostałe efekty ASS są pomijane.
- Wynik jest zawsze w UTF-8. Gdy `encoding` ma wartość `auto`, plik będący poprawnym UTF-8 jest odczytywany bez zmian, a każdy inny jest odczytywany jako Windows-1252, czyli zwykłe kodowanie starszych plików SRT w językach Europy Zachodniej. Jeśli znaki z akcentami lub spoza alfabetu łacińskiego wyświetlają się nieprawidłowo, ustaw `encoding` na rzeczywiste kodowanie pliku (na przykład `gb18030` dla chińskiego uproszczonego lub `windows-1251` dla cyrylicy).
- Przesyłane pliki napisów są domyślnie ograniczone do 1 MB. Limit można podnieść lub zdjąć za pomocą `MAX_SUBTITLE_SIZE_MB`.
