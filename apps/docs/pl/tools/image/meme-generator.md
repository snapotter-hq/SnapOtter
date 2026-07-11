---
description: "Twórz memy z szablonów lub własnych obrazów, ze stylizowanymi polami tekstowymi i opcjami czcionek."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: 5641aa8f9ea3
---

# Generator memów {#meme-generator}

Twórz memy przy użyciu wbudowanych szablonów lub własnych obrazów. Dodawaj tekst w klasycznej stylistyce memów (pogrubiony tekst z obrysem), z wieloma gotowymi układami i opcjami czcionek.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Przyjmuje jedno z dwóch:
- **Dane formularza multipart** z plikiem obrazu i polem JSON `settings` (tryb własnego obrazu)
- **Treść JSON** z `templateId` (tryb szablonu, bez potrzeby przesyłania pliku)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| templateId | string | Nie | - | ID wbudowanego szablonu memu. Jeśli podane, nie trzeba przesyłać obrazu |
| textLayout | string | Nie | `"top-bottom"` | Układ pól tekstowych: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | Nie | `[]` | Tablica obiektów pól tekstowych z polami `id` i `text` |
| fontFamily | string | Nie | `"anton"` | Czcionka: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | Nie | auto | Rozmiar czcionki w pikselach (8 do 200). Obliczany automatycznie, jeśli pominięty |
| textColor | string | Nie | `"#ffffff"` | Kolor wypełnienia tekstu |
| strokeColor | string | Nie | `"#000000"` | Kolor obrysu/konturu tekstu |
| textAlign | string | Nie | `"center"` | Wyrównanie tekstu: `left`, `center`, `right` |
| allCaps | boolean | Nie | `true` | Zamień tekst na wielkie litery |

### Pola tekstowe {#text-boxes}

Każdy wpis w tablicy `textBoxes` powinien mieć:

| Pole | Typ | Opis |
|-------|------|-------------|
| id | string | Identyfikator pola pasujący do układu (np. `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | Tekst memu do wyświetlenia |

### Identyfikatory pól dla układów tekstu {#text-layout-box-ids}

| Układ | Dostępne ID pól |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Przykładowe żądanie {#example-request}

Własny obraz z tekstem u góry i u dołu:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Z użyciem wbudowanego szablonu (treść JSON, bez przesyłania pliku):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Uwagi {#notes}

- Wymagane jest podanie `templateId` albo przesłanego pliku obrazu. Podanie obu naraz spowoduje użycie szablonu.
- Szablony definiują własne pozycje pól tekstowych; parametr `textLayout` jest ignorowany przy użyciu szablonów.
- Tekst jest renderowany jako SVG z obrysem, aby uzyskać klasyczny wygląd memu.
- Rozmiar czcionki jest obliczany automatycznie tak, aby zmieścić tekst w polu, jeśli nie został ustawiony jawnie.
- Puste pola tekstowe są pomijane (renderowanie nie następuje, jeśli wszystkie pola są puste).
- Nazwa pliku wynikowego zawiera ID szablonu przy jego użyciu (np. `meme-drake.png`).
- Pliki wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetwarzaniem.
