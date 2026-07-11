---
description: "Gere um placeholder de imagem de baixa qualidade minúsculo com data URI em base64."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: b4aa0b85c32e
---

# Placeholder LQIP {#lqip-placeholder}

Gere um placeholder de imagem de baixa qualidade (LQIP) minúsculo a partir de uma imagem de origem. Retorna um pequeno arquivo de placeholder junto com um data URI em base64, uma tag HTML `<img>` pronta para uso e um trecho de CSS `background-image` para incorporação imediata.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| width | integer | Não | `16` | Largura alvo em pixels (4-64) |
| blur | number | Não | `2` | Raio de desfoque para a estratégia de desfoque (0-20) |
| strategy | string | Não | `"blur"` | Estratégia de placeholder: `blur`, `pixelate` ou `solid` |
| format | string | Não | `"webp"` | Formato de saída: `webp`, `png` ou `jpeg` |
| quality | integer | Não | `50` | Qualidade de saída (1-100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Observações {#notes}

- O campo `dataUri` contém o data URI completo, pronto para uso em atributos `src` ou CSS sem requisições adicionais.
- Os campos `html` e `css` fornecem trechos para copiar e colar em casos de uso comuns.
- A estratégia `blur` produz uma miniatura suave e desfocada. A estratégia `pixelate` cria um mosaico em blocos. A estratégia `solid` retorna uma única cor média.
- Os tamanhos típicos de placeholder são de 200-500 bytes, tornando-os adequados para incorporação direta no HTML.
- A altura é calculada automaticamente para preservar a proporção da imagem de origem.
- Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
