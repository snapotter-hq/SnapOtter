---
description: "Przechwytuj strony internetowe lub fragmenty HTML jako obrazy wysokiej jakości z emulacją urządzeń."
i18n_source_hash: 1e49d070ea2e
i18n_provenance: human
i18n_output_hash: bb38d8d464f0
---

# HTML na obraz {#html-to-image}

Przechwyć adres URL strony internetowej lub surową zawartość HTML jako obraz zrzutu ekranu. Obsługuje emulację urządzeń (komputer stacjonarny, tablet, telefon), przechwytywanie całej strony i wiele formatów wyjściowych.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Przyjmuje **treść JSON** (nie multipart). Nie jest wymagane przesyłanie pliku.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| url | string | Warunkowo | - | Adres URL do przechwycenia (musi być prawidłowym adresem URL) |
| html | string | Warunkowo | - | Surowa zawartość HTML do wyrenderowania (1 do 5 000 000 znaków) |
| format | string | Nie | `"png"` | Format wyjściowy: `jpg`, `png`, `webp` |
| quality | number | Nie | `90` | Jakość wyjściowa dla formatów stratnych (1 do 100) |
| fullPage | boolean | Nie | `false` | Przechwyć całą przewijalną stronę, a nie tylko widoczny obszar |
| devicePreset | string | Nie | `"desktop"` | Emulacja urządzenia: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | Nie | `1280` | Niestandardowa szerokość widoku w pikselach (320 do 3840, używana gdy devicePreset to `custom`) |
| viewportHeight | number | Nie | `720` | Niestandardowa wysokość widoku w pikselach (320 do 2160, używana gdy devicePreset to `custom`) |

Należy podać albo `url`, albo `html`, ale nie oba naraz.

### Presety urządzeń {#device-presets}

| Preset | Szerokość | Wysokość | Mobilny UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | Nie |
| `tablet` | 768 | 1024 | Nie |
| `mobile` | 375 | 812 | Tak |
| `custom` | (określone przez użytkownika) | (określone przez użytkownika) | Nie |

## Przykładowe żądanie {#example-request}

Przechwyć stronę internetową:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

Wyrenderuj zawartość HTML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## Uwagi {#notes}

- Wymaga zainstalowania Chromium na serwerze. Zwraca HTTP 503, jeśli usługa przeglądarki jest niedostępna.
- Adresy URL są walidowane pod kątem ataków SSRF (adresy sieci prywatnej/wewnętrznej są blokowane).
- Ten punkt końcowy jest ograniczony do 120 żądań na godzinę.
- `originalSize` zawsze wynosi 0, ponieważ to narzędzie generuje obrazy z adresów URL/HTML.
- Nazwa pliku wyjściowego to `screenshot.<format>`.
- Jeśli wczytanie strony trwa zbyt długo, żądanie zwraca HTTP 504 (przekroczenie limitu czasu bramy).
- Jeśli usługa przeglądarki wielokrotnie ulega awarii, jest tymczasowo wyłączana i zwraca HTTP 503 z kodem `BROWSER_CRASHED`.
