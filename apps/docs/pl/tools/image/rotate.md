---
description: "Obracaj obrazy o dowolny kąt i odbijaj je w poziomie lub pionie."
i18n_source_hash: af2581d7cd8d
i18n_provenance: human
i18n_output_hash: 4e6c302679f5
---

# Obrót i odbicie {#rotate-flip}

Obracaj obrazy o dowolny kąt i/lub odbijaj je w poziomie lub pionie. Operacje obrotu i odbicia można łączyć w jednym żądaniu.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Przyjmuje dane formularza multipart z plikiem obrazu i polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| angle | number | Nie | `0` | Kąt obrotu w stopniach (zgodnie z ruchem wskazówek zegara). Przyjmuje dowolną wartość liczbową. |
| horizontal | boolean | Nie | `false` | Odbij obraz w poziomie (lustrzane odbicie) |
| vertical | boolean | Nie | `false` | Odbij obraz w pionie |

## Przykładowe żądanie {#example-request}

Obrót o 90 stopni zgodnie z ruchem wskazówek zegara:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Odbicie w poziomie:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Obrót i odbicie razem:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Uwagi {#notes}

- Najpierw stosowany jest obrót, potem operacje odbicia.
- Obroty inne niż o 90 stopni (np. 45 stopni) powiększą płótno, aby zmieścić obrócony obraz, z wypełnieniem przezroczystym lub czarnym zależnie od formatu wyjściowego.
- Typowe wartości: 90, 180, 270 dla obrotów o ćwierć obrotu.
- Orientacja EXIF jest automatycznie stosowana przed przetwarzaniem, więc obrót jest względny do orientacji wizualnej.
