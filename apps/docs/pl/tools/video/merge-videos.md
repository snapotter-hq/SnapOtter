---
description: "Połączenie wielu klipów wideo w jeden plik."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 13d1dfdb695f
---

# Merge Videos {#merge-videos}

Łączy wiele klipów wideo w jeden plik MP4. Wszystkie wejścia są normalizowane do rozdzielczości pierwszego wideo i 30 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Przyjmuje dane formularza multipart z dwoma lub większą liczbą plików wideo. To jest endpoint asynchroniczny - zwraca `202 Accepted` natychmiast, a postęp jest przesyłany strumieniowo przez SSE pod `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

To narzędzie nie ma parametrów ustawień. Prześlij 2-10 plików wideo jako wiele części `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Klipy są łączone w kolejności, w jakiej są przesyłane.
- Wszystkie klipy są ponownie kodowane, aby dopasować się do rozdzielczości, liczby klatek na sekundę (30 fps) i kodeka (H.264) pierwszego klipu. Niedopasowane wejścia są automatycznie normalizowane.
- Przyjmuje 2-10 plików wideo na żądanie.
- Aktualizacje postępu są dostępne przez SSE pod `GET /api/v1/jobs/{jobId}/progress` aż do zakończenia zadania.
