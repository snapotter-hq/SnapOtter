---
description: "Aplique um efeito duotônico de duas cores com cores de sombra e realce personalizadas."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: f31b94dc6864
---

# Duotônico {#duotone}

Aplique um efeito duotônico de duas cores a uma imagem. A imagem é convertida para tons de cinza e depois mapeada para um gradiente entre a cor de sombra (tons escuros) e a cor de realce (tons claros).

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| shadow | string | Não | `"#1e3a8a"` | Cor de sombra em hexadecimal (aplicada aos tons escuros) |
| highlight | string | Não | `"#fbbf24"` | Cor de realce em hexadecimal (aplicada aos tons claros) |
| intensity | integer | Não | `100` | Intensidade do efeito (0-100); 0 retorna o original, 100 aplica o duotônico completo |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Notas {#notes}

- O formato de saída corresponde ao formato de entrada. Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
- Uma `intensity` menor que 100 mescla o resultado duotônico com a imagem original, permitindo efeitos mais sutis.
- Combinações duotônicas populares incluem azul-marinho/dourado, verde-azulado/coral e roxo/rosa.
