---
description: "Converta um EPUB para PDF, DOCX, HTML ou Markdown."
i18n_source_hash: 7d94fc18ca97
i18n_provenance: human
i18n_output_hash: a8b92fec161f
---

# Converter EPUB {#convert-epub}

Converta um e-book EPUB para PDF, Word (DOCX), HTML ou Markdown. Recursos remotos dentro do livro não são buscados.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Aceita dados de formulário multipart com um arquivo EPUB e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Sim | - | Formato de saída: `pdf`, `docx`, `html`, `md` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- Formato de entrada aceito: `.epub`.
- Recursos remotos incorporados no EPUB (imagens e fontes externas) não são buscados por segurança.
- A fidelidade das imagens na saída convertida pode variar dependendo da estrutura do EPUB.
- A conversão é realizada pelo Pandoc no servidor.
