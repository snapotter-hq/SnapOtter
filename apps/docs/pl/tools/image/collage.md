---
description: "Łącz wiele obrazów w kolaże siatkowe z ponad 25 szablonami, regulowanymi odstępami i narożnikami oraz przesuwaniem i powiększaniem dla każdej komórki."
i18n_source_hash: 96f2055717df
i18n_provenance: human
i18n_output_hash: 12ed9b5e0135
---

# Kolaż / Siatka {#collage-grid}

Łącz wiele obrazów w piękne kolaże siatkowe z ponad 25 szablonami. Obsługuje układy od 2 do 9 obrazów z konfigurowalnym odstępem, promieniem narożnika, kolorem tła oraz przesuwaniem/powiększaniem dla każdej komórki.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| templateId | string | Tak | - | Identyfikator układu szablonu (np. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | Nie | - | Tablica ustawień dla poszczególnych komórek z `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Tak | - | Indeks obrazu umieszczanego w tej komórce (liczony od 0) |
| cells[].panX | number | Nie | 0 | Poziome przesunięcie (od -100 do 100) |
| cells[].panY | number | Nie | 0 | Pionowe przesunięcie (od -100 do 100) |
| cells[].zoom | number | Nie | 1 | Poziom powiększenia (od 1 do 10) |
| cells[].objectFit | string | Nie | `"cover"` | Sposób wypełniania komórki obrazem: `cover` lub `contain` |
| gap | number | Nie | 8 | Odstęp między komórkami w pikselach (od 0 do 500) |
| cornerRadius | number | Nie | 0 | Promień narożnika każdej komórki w pikselach (od 0 do 500) |
| backgroundColor | string | Nie | `"#FFFFFF"` | Kolor tła jako wartość szesnastkowa lub `"transparent"` |
| aspectRatio | string | Nie | `"free"` | Proporcje płótna: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | Nie | `"png"` | Format wyjściowy: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Nie | 90 | Jakość wyjściowa (od 1 do 100) |

## Dostępne szablony {#available-templates}

| Identyfikator szablonu | Obrazy | Układ |
|-------------|--------|--------|
| `2-h-equal` | 2 | Dwie równe kolumny |
| `2-v-equal` | 2 | Dwa równe wiersze |
| `2-h-left-large` | 2 | Lewa 2/3, prawa 1/3 |
| `2-h-right-large` | 2 | Lewa 1/3, prawa 2/3 |
| `3-left-large` | 3 | Duży po lewej, dwa ułożone po prawej |
| `3-right-large` | 3 | Dwa ułożone po lewej, duży po prawej |
| `3-top-large` | 3 | Duży na górze, dwie kolumny na dole |
| `3-h-equal` | 3 | Trzy równe kolumny |
| `3-v-equal` | 3 | Trzy równe wiersze |
| `4-grid` | 4 | Siatka 2x2 |
| `4-left-large` | 4 | Duży po lewej, trzy ułożone po prawej |
| `4-top-large` | 4 | Duży na górze, trzy kolumny na dole |
| `4-bottom-large` | 4 | Trzy kolumny na górze, duży na dole |
| `5-top2-bottom3` | 5 | Dwa na górze, trzy na dole |
| `5-top3-bottom2` | 5 | Trzy na górze, dwa na dole |
| `5-left-large` | 5 | Duży po lewej, cztery ułożone po prawej |
| `5-center-large` | 5 | Duży na środku, cztery w narożnikach |
| `6-grid-2x3` | 6 | 2 kolumny x 3 wiersze |
| `6-grid-3x2` | 6 | 3 kolumny x 2 wiersze |
| `6-top-large` | 6 | Duży na górze, pięć kolumn na dole |
| `7-mosaic` | 7 | Układ mozaikowy |
| `8-mosaic` | 8 | Układ mozaikowy |
| `9-grid` | 9 | Siatka 3x3 |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Uwagi {#notes}

- Prześlij wiele plików obrazów w żądaniu multipart. Obrazy są przypisywane do komórek szablonu w kolejności przesyłania.
- Jeśli prześlesz więcej obrazów, niż obsługuje szablon, dodatkowe obrazy są ignorowane.
- Obsługuje formaty wejściowe HEIC, RAW, PSD i SVG (automatycznie dekodowane).
- Bazowy rozmiar płótna wynosi 2400 px po najdłuższym boku, skalowany zgodnie z wybranymi proporcjami.
- Gdy `aspectRatio` ma wartość `"free"`, płótno domyślnie przyjmuje proporcje 4:3 (2400x1800).
- Wartości `panX`/`panY` dla poszczególnych komórek przesuwają okno kadrowania wewnątrz komórki. Wartość 100 przesuwa całkowicie do jednej krawędzi, -100 do przeciwnej.
- Kolor tła `"transparent"` jest zachowywany tylko w formatach wyjściowych `png`, `webp` lub `avif`.
