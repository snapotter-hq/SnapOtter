---
description: "Combine uma ou mais imagens em um documento PDF com opções de tamanho de página, orientação e tamanho de arquivo alvo."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: cb8ca2c9aeaf
---

# Imagem para PDF {#image-to-pdf}

Combine uma ou mais imagens em um documento PDF. Suporta vários tamanhos de página, orientações, margens e definição opcional de tamanho de arquivo alvo por ajuste de qualidade.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Aceita dados de formulário multipart com um ou mais arquivos de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| pageSize | string | Não | `"A4"` | Tamanho da página: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | Não | `"portrait"` | Orientação da página: `portrait` ou `landscape` |
| margin | number | Não | `20` | Margem da página em pontos (0-500) |
| targetSize | object | Não | - | Restrição de tamanho de arquivo alvo (veja abaixo) |
| collate | boolean | Não | `true` | Combina todas as imagens em um único PDF. Se `false`, cria um PDF por imagem. |

### Objeto de Tamanho Alvo {#target-size-object}

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|----------|-------------|
| value | number | Sim | Valor do tamanho alvo |
| unit | string | Sim | Unidade: `KB` ou `MB` |

O tamanho alvo mínimo é 50 KB.

## Exemplo de Requisição {#example-request}

PDF básico com várias imagens:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

Com tamanho de arquivo alvo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

Um PDF por imagem:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Exemplo de Resposta (Combinada) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Exemplo de Resposta (Não Combinada) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Exemplo de Resposta (Com Tamanho Alvo) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Observações {#notes}

- As imagens são centralizadas na página e escaladas para caber dentro das margens preservando a proporção. As imagens nunca são ampliadas.
- Quando `collate` é `false`, cada imagem se torna um arquivo PDF separado, e o download é um arquivo ZIP contendo todos os PDFs.
- O recurso de tamanho alvo usa busca binária iterativa sobre os níveis de qualidade JPEG (10-95) para encontrar a melhor qualidade que caiba dentro do orçamento.
- Imagens transparentes são achatadas para branco antes de serem incorporadas ao PDF.
- Formatos de entrada suportados: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG e outros.
- A orientação EXIF é aplicada automaticamente antes da incorporação.
