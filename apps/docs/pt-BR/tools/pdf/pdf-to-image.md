---
description: "Converta páginas de PDF em imagens de alta qualidade."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: 216205ce228d
---

# PDF to Image {#pdf-to-image}

Converta páginas de PDF em imagens raster de alta qualidade. Oferece suporte a seleção de páginas, vários formatos de saída, controle de DPI e modos de cor. Inclui sub-rotas de informações e pré-visualização para inspecionar PDFs antes da conversão.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Não | `"png"` | Formato de saída: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | Não | 150 | Resolução de renderização (36 a 2400). DPI mais alto produz imagens maiores e mais detalhadas. |
| quality | number | Não | 85 | Qualidade de saída para formatos com perdas (1 a 100) |
| colorMode | string | Não | `"color"` | Modo de cor: `color`, `grayscale`, `bw` (limiar de preto e branco) |
| pages | string | Não | `"all"` | Seleção de páginas: `all`, página única (`3`), intervalo (`1-5`) ou separadas por vírgula (`1,3,5-8`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

Retorna a contagem de páginas de um PDF sem renderizar nenhuma página.

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

Retorna miniaturas JPEG de baixa resolução de todas as páginas como data URLs base64. Útil para construir uma interface de seleção de páginas.

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- Usa o MuPDF para renderização de PDF, oferecendo saída de alta fidelidade com renderização correta de fontes e gráficos vetoriais.
- PDFs protegidos por senha não são suportados e retornarão um erro 400.
- O parâmetro `pages` oferece suporte a uma sintaxe flexível:
  - `"all"` ou `""` - todas as páginas
  - `"3"` - página única
  - `"1-5"` - intervalo de páginas (inclusivo)
  - `"1,3,5-8"` - páginas individuais e intervalos combinados
- Os números de página começam em 1. Especificar páginas além do comprimento do documento retorna um erro 400.
- O endpoint principal sempre gera tanto downloads de páginas individuais quanto um ZIP contendo todas as páginas selecionadas.
- O endpoint de pré-visualização renderiza a 72 DPI e redimensiona para 300px de largura para geração rápida de miniaturas. As miniaturas são JPEG com qualidade de 60%.
- O endpoint de pré-visualização respeita a configuração de servidor `MAX_PDF_PAGES`, limitando quantas miniaturas são geradas.
- Para documentos grandes em DPI alto, o tempo de processamento aumenta proporcionalmente. Considere usar DPI mais baixo (150) para uso web e DPI mais alto (300-600) para impressão.
