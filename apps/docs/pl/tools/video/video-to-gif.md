---
description: "Zamiana klipu wideo na animowany GIF."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 8aa3d44e47bf
---

# Video to GIF {#video-to-gif}

Zamienia klip wideo na animowany GIF z konfigurowalną liczbą klatek na sekundę, szerokością, czasem początku i czasem trwania.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`. To jest endpoint asynchroniczny - zwraca `202 Accepted` natychmiast, a postęp jest przesyłany strumieniowo przez SSE pod `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| fps | integer | Nie | `12` | Wyjściowa liczba klatek na sekundę (1-30) |
| width | integer | Nie | `480` | Szerokość wyjściowa w pikselach (64-1280). Wysokość skaluje się proporcjonalnie |
| startS | number | Nie | `0` | Czas początku w sekundach (musi być >= 0) |
| durationS | number | Nie | `5` | Czas trwania w sekundach (powyżej 0, maks. 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Niższe wartości `fps` i `width` tworzą mniejsze pliki GIF. GIF o szerokości 480px przy 12 fps to zazwyczaj dobra równowaga.
- Maksymalny czas trwania to 60 sekund. Dłuższe klipy tworzą bardzo duże pliki.
- Aktualizacje postępu są dostępne przez SSE pod `GET /api/v1/jobs/{jobId}/progress` aż do zakończenia zadania.
