---
description: "Przekształć plik PDF na Markdown, zachowując nagłówki, listy i tabele tam, gdzie występują w PDF."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: b1b623038c1f
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

Zamień plik PDF na plik Markdown, który możesz wrzucić do wiki, na statyczną stronę albo do potoku z LLM.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Przyjmuje dane formularza multipart z plikiem PDF.

## Parameters {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij plik PDF, a otrzymasz z powrotem plik `.md`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

Duży plik PDF może potrwać dłużej niż okno synchroniczne. API odpowiada wtedy `202` z `jobId`, a postęp śledzisz pod `/api/v1/jobs/{jobId}/progress`.

## What gets kept {#what-gets-kept}

PDF przechowuje tekst z pozycjami, a nie strukturę, więc konwerter ją wykrywa:

- **Nagłówki.** Krótkie wiersze wyraźnie większe od tekstu podstawowego stają się nagłówkami od `#` do `######`, uszeregowanymi według rozmiaru w całym dokumencie.
- **Listy.** Wiersze zaczynające się od punktora lub numeru stają się elementami listy.
- **Pogrubienie, kursywa i linki.** Zachowane w tekście. Przetrwają tylko linki `http`, `https` i `mailto`.
- **Tabele.** Tabele narysowane liniami trafiają do wyniku jako tabele Markdown. Tabele ułożone samymi odstępami zwykle wychodzą jako zwykłe akapity.

Obrazy są pomijane. Układy wielokolumnowe i nietypowe projekty stron są obsługiwane na zasadzie najlepszych starań, więc sprawdź wynik, zanim na nim polegasz.

## Notes {#notes}

- Akceptowany format wejściowy: `.pdf`.
- Pole `chars` w odpowiedzi to długość wynikowego pliku Markdown.
- Zeskanowany plik PDF nie ma warstwy tekstowej do konwersji. Narzędzie odrzuca go z `422` i kodem `NO_TEXT_LAYER` zamiast zwracać pusty plik. Dla takich plików użyj narzędzia [PDF OCR](./ocr-pdf).
- Do konwersji w drugą stronę [Markdown na PDF](../files/markdown-to-pdf), [Markdown na DOCX](../files/markdown-to-docx) i [Markdown na HTML](../files/markdown-to-html) odczytują pliki `.md`.
