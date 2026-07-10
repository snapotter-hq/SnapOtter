---
description: "Gire páginas em um PDF em 90, 180 ou 270 graus."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: d30dc3765354
---

# Rotate PDF {#rotate-pdf}

Gire todas ou páginas selecionadas em um PDF por um ângulo especificado.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| angle | integer | Não | `90` | Ângulo de rotação: `90`, `180` ou `270` |
| range | string | Não | `"1-z"` | Intervalo de páginas na sintaxe qpdf, por exemplo `"1-5,8"` (`"1-z"` = todas as páginas) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- A rotação é no sentido horário.
- Os intervalos de páginas usam a sintaxe qpdf: `1-5` para as páginas 1 a 5, `z` para a última página, e vírgulas para combinar intervalos.
- O intervalo padrão `"1-z"` gira todas as páginas.
