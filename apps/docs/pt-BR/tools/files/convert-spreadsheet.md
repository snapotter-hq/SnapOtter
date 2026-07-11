---
description: "Converta entre os formatos Excel, OpenDocument e CSV."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: e5446f4798a2
---

# Converter Planilha {#convert-spreadsheet}

Converta planilhas entre os formatos Excel (XLSX), OpenDocument Spreadsheet (ODS) e CSV. Pastas de trabalho com várias planilhas exportam a primeira planilha ao converter para CSV.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Aceita dados de formulário multipart com um arquivo Excel/ODS/CSV e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Sim | - | Formato de saída: `xlsx`, `ods`, `csv` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Exemplo de Resposta {#example-response}

Retorna `202 Accepted`. Acompanhe o progresso via SSE em `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notas {#notes}

- Formatos de entrada aceitos: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Ao converter uma pasta de trabalho com várias planilhas para CSV, apenas a primeira planilha é exportada.
- Fórmulas são avaliadas e exportadas como valores estáticos na saída CSV.
- O formato de saída deve ser diferente do formato de entrada.
