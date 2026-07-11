---
description: "Wyodrębnij powtarzające się elementy z XML do tabeli CSV."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: ce37ba0078e2
---

# XML na CSV {#xml-to-csv}

Wyodrębnij powtarzające się elementy z pliku XML do płaskiej tabeli CSV. Narzędzie automatycznie znajduje pierwszą tablicę obiektów w drzewie XML i mapuje każdy element na wiersz.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Przyjmuje dane formularza multipart z plikiem XML. Pole ustawień nie jest wymagane.

## Parametry {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Powtarzający się element jest wykrywany automatycznie na podstawie struktury XML.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Uwagi {#notes}

- Jako dane wejściowe akceptowane są wyłącznie pliki `.xml`.
- Narzędzie skanuje drzewo XML w poszukiwaniu pierwszego powtarzającego się zestawu elementów rodzeństwa i używa ich jako wierszy.
- Każda unikalna nazwa elementu podrzędnego lub atrybutu staje się nagłówkiem kolumny CSV.
- To konwersja jednokierunkowa. Do dwukierunkowej konwersji JSON/XML użyj narzędzia [JSON na XML](/pl/tools/files/json-xml).
