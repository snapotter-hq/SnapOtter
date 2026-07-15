---
description: "Organize várias páginas de PDF por folha (2 por folha, 4 por folha, etc.)."
i18n_source_hash: 972bf997c95c
i18n_provenance: human
i18n_output_hash: 7ce40924fea5
---

# Páginas por Folha (N-up) {#n-up-pdf}

Organize várias páginas por folha para economizar papel na impressão, como layouts de 2 por folha ou 4 por folha.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Não | `2` | Páginas por folha: `2`, `3`, `4`, `8`, `9`, `12` ou `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- As páginas são organizadas na ordem de leitura (da esquerda para a direita, de cima para baixo).
- O tamanho da página de saída corresponde ao original; as páginas individuais são reduzidas para caber na grade.
- Um documento de 20 páginas com `perSheet: 4` produz uma saída de 5 páginas.
