---
description: "Konwertuj czcionki między TTF, OTF, WOFF i WOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: a5e79641709a
i18n_hash_version: 2
---

# Konwertuj czcionkę {#convert-font}

Konwertuje plik czcionki między formatami TrueType (TTF), OpenType CFF (OTF), WOFF i WOFF2. Użyj go, aby zrobić z czcionki desktopowej czcionkę internetową albo uzyskać TTF z OTF dla aplikacji, która przyjmuje tylko TrueType.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Przyjmuje dane formularza multipart z plikiem `.ttf`, `.otf`, `.woff` lub `.woff2` oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Nie | `ttf` | Format wyjściowy: `ttf`, `otf`, `woff` lub `woff2` |

## Przykładowe żądanie {#example-request}

OTF na TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF na WOFF2 dla sieci:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Uwagi {#notes}

- WOFF i WOFF2 to skompresowane opakowania tych samych danych czcionki, więc konwersja do nich lub z nich nie zmienia konturów.
- Konwersja OTF na TTF zamienia krzywe sześcienne (CFF) na kwadratowe krzywe TrueType. Każda krzywa mieści się w 1 jednostce czcionki od oryginału, co jest niewidoczne przy zwykłych rozmiarach, ale konwersja nie jest dokładnie odwracalna. Konwersja TTF na OTF zachowuje kształt krzywych i tylko zaokrągla punkty kontrolne do całych jednostek czcionki.
- Uprawnienia do osadzania czcionki (pole OS/2 `fsType`) pozostają bez zmian.
- Kolekcje czcionek (`.ttc`) nie są obsługiwane. Zmiennych czcionek TrueType nie można przekonwertować na OTF, a zmiennych czcionek CFF2 na TTF; zamiast tego przekonwertuj je na WOFF lub WOFF2.
- Konwersja działa w pythonowym workerze dokumentów z takim samym limitem czasu jak inne narzędzia do dokumentów, a nie w procesie API.
