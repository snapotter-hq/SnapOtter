---
description: "Converta entre CSV e Excel (XLSX), em ambas as direções."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 5506331d1793
---

# CSV para Excel {#csv-to-excel}

Converta entre os formatos CSV e Excel (XLSX) em ambas as direções. Envie um arquivo CSV ou TSV para obter XLSX, ou envie um arquivo XLSX para obter CSV.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Aceita dados de formulário multipart com um arquivo CSV, TSV ou XLSX e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| sheet | integer | Não | `1` | Número da planilha a exportar ao converter de XLSX (mín. 1) |

## Exemplo de Requisição {#example-request}

CSV para Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel para CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notas {#notes}

- A direção da conversão é detectada automaticamente pela extensão do arquivo de entrada: `.csv` ou `.tsv` produz `.xlsx`, e `.xlsx` produz `.csv`.
- O parâmetro `sheet` só se aplica ao converter de XLSX. Ele seleciona qual planilha exportar.
- Arquivos TSV (valores separados por tabulação) são suportados junto com CSV.
