---
description: "Converta documentos do Word em PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 7b418cfc42b2
---

# Word para PDF {#word-to-pdf}

Converta documentos do Word, texto OpenDocument, RTF ou arquivos de texto simples em PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Aceita dados de formulário multipart com um arquivo Word/ODT/RTF/TXT.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie um documento e ele será convertido em PDF.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
```

## Exemplo de Resposta {#example-response}

Retorna `202 Accepted`. Acompanhe o progresso via SSE em `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Observações {#notes}

- Formatos de entrada aceitos: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- A conversão é feita pelo LibreOffice em modo headless no servidor.
- As fontes incorporadas ao documento são usadas quando disponíveis; caso contrário, fontes do sistema são substituídas.
- Cabeçalhos, rodapés, tabelas e imagens são preservados na saída em PDF.
