---
description: "Converta um PDF em Markdown, mantendo títulos, listas e tabelas quando o PDF os tem."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 045c4d063753
i18n_hash_version: 2
---

# PDF para Markdown {#pdf-to-markdown}

Transforme um PDF em um arquivo Markdown que você pode colocar em uma wiki, em um site estático ou em um pipeline de LLM.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Aceita dados de formulário multipart com um arquivo PDF.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie um PDF e receba um arquivo `.md`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

Um PDF grande pode demorar mais que a janela síncrona. Nesse caso a API responde `202` com um `jobId`, e você acompanha o progresso em `/api/v1/jobs/{jobId}/progress`.

## O que é mantido {#what-gets-kept}

Um PDF guarda texto posicionado, não estrutura, então o conversor a infere:

- **Títulos.** Linhas curtas claramente maiores que o texto do corpo viram títulos de `#` a `######`, classificados por tamanho em todo o documento.
- **Listas.** Linhas que começam com um marcador ou um número viram itens de lista.
- **Negrito, itálico e links.** Mantidos no texto. Só os links `http`, `https` e `mailto` são preservados.
- **Tabelas.** Tabelas desenhadas com linhas de grade saem como tabelas Markdown. Tabelas montadas só com espaçamento geralmente saem como parágrafos simples.

As imagens são descartadas. Layouts de várias colunas e designs de página incomuns são tratados no melhor esforço, então confira a saída antes de depender dela.

## Notes {#notes}

- Formato de entrada aceito: `.pdf`.
- O campo `chars` na resposta é o tamanho da saída em Markdown.
- Um PDF digitalizado não tem camada de texto para converter. A ferramenta o recusa com `422` e o código `NO_TEXT_LAYER` em vez de devolver um arquivo vazio. Use a ferramenta [PDF OCR](./ocr-pdf) para esses arquivos.
- Para o caminho de volta, [Markdown para PDF](../files/markdown-to-pdf), [Markdown para DOCX](../files/markdown-to-docx) e [Markdown para HTML](../files/markdown-to-html) leem arquivos `.md`.
