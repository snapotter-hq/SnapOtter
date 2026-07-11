---
description: "Converta entre os formatos Word, OpenDocument, RTF e texto simples."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: df280fed2c6f
---

# Converter Documento {#convert-document}

Converta documentos entre os formatos Word (DOCX), OpenDocument (ODT), RTF e texto simples usando o LibreOffice.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Aceita dados de formulário multipart com um arquivo Word/ODT/RTF/TXT e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Sim | - | Formato de saída: `docx`, `odt`, `rtf`, `txt` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- Formatos de entrada aceitos: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- A conversão é realizada pelo LibreOffice executando em modo headless no servidor.
- Formatações complexas (macros, objetos incorporados) podem não sobreviver à conversão entre formatos.
- O formato de saída deve ser diferente do formato de entrada.
