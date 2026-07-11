---
description: "Redimensione imagens por pixels, porcentagem ou com modos de ajuste."
i18n_source_hash: 00d1bffa4d38
i18n_provenance: human
i18n_output_hash: c6cbb0a923c7
---

# Redimensionar {#resize}

Redimensione imagens especificando dimensões exatas em pixels, um fator de escala em porcentagem ou um modo de ajuste que controla como a imagem se adapta às dimensões de destino.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/resize`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| width | integer | Não | - | Largura de destino em pixels (máximo 16383) |
| height | integer | Não | - | Altura de destino em pixels (máximo 16383) |
| fit | string | Não | `"contain"` | Como a imagem se ajusta às dimensões: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | Não | `false` | Impedir o aumento de escala se a imagem for menor que o destino |
| percentage | number | Não | - | Escalonar por porcentagem (por exemplo, 50 para metade do tamanho) |

Pelo menos um de `width`, `height` ou `percentage` deve ser fornecido.

### Modos de Ajuste {#fit-modes}

- **contain** - Redimensiona para caber dentro das dimensões, preservando a proporção (pode deixar espaço vazio)
- **cover** - Redimensiona para cobrir as dimensões, preservando a proporção (pode recortar)
- **fill** - Estica para corresponder exatamente às dimensões (ignora a proporção)
- **inside** - Como `contain`, mas apenas reduz a escala, nunca a aumenta
- **outside** - Como `cover`, mas apenas reduz a escala, nunca a aumenta

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Redimensionar por porcentagem:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notas {#notes}

- A dimensão máxima é de 16383 pixels em qualquer eixo (limite do Sharp/libvips).
- O formato de saída corresponde ao formato de entrada. Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
- A orientação EXIF é aplicada automaticamente antes do redimensionamento.
- O sinalizador `withoutEnlargement` é útil para processamento em lote, onde algumas imagens já podem ser menores que o destino.
