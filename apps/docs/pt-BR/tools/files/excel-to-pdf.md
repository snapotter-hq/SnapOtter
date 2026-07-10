---
description: "Converta planilhas para PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 9a4648dc3d5a
---

# Excel para PDF {#excel-to-pdf}

Converta planilhas Excel, OpenDocument ou CSV para PDF. Planilhas largas podem se estender por várias páginas.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Aceita dados de formulário multipart com um arquivo Excel/ODS/CSV.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie uma planilha e ela será convertida para PDF.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- Planilhas largas podem ser divididas em várias páginas no PDF resultante.
- Gráficos e formatação condicional são renderizados na saída PDF.
- A conversão é realizada pelo LibreOffice executando em modo headless no servidor.
