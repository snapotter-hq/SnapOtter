---
description: "Konwertuj między YAML a JSON w obu kierunkach."
i18n_source_hash: acf8ca21ee99
i18n_provenance: human
i18n_output_hash: d0d88d845f4d
---

# YAML / JSON {#yaml-json}

Konwertuj między formatami YAML i JSON w obu kierunkach. Prześlij plik YAML, aby otrzymać JSON, lub prześlij plik JSON, aby otrzymać YAML.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Przyjmuje dane formularza multipart z plikiem YAML lub JSON. Pole ustawień nie jest wymagane.

## Parametry {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Kierunek konwersji jest określany na podstawie rozszerzenia pliku wejściowego.

## Przykładowe żądanie {#example-request}

YAML na JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON na YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Uwagi {#notes}

- Kierunek konwersji jest wykrywany automatycznie na podstawie rozszerzenia pliku wejściowego: `.yaml` lub `.yml` daje `.json`, a `.json` daje `.yaml`.
- Akceptowane są zarówno rozszerzenia `.yaml`, jak i `.yml`.
- Konwertowany jest tylko pierwszy dokument w wielodokumentowym pliku YAML; dodatkowe dokumenty oddzielone przez `---` są ignorowane.
