---
description: "Recorte imagens especificando uma região com posição e dimensões."
i18n_source_hash: aab38ccd7c53
i18n_provenance: human
i18n_output_hash: 710ea29989d0
---

# Recortar {#crop}

Recorte imagens definindo uma região retangular usando posição e tamanho. Suporta unidades tanto em pixels quanto em porcentagem.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/crop`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| left | number | Sim | - | Deslocamento X da região de recorte (a partir da borda esquerda) |
| top | number | Sim | - | Deslocamento Y da região de recorte (a partir da borda superior) |
| width | number | Sim | - | Largura da região de recorte |
| height | number | Sim | - | Altura da região de recorte |
| unit | string | Não | `"px"` | Unidade para os valores: `px` ou `percent` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Recortar usando valores em porcentagem:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Notas {#notes}

- A região de recorte deve caber dentro dos limites da imagem. Se a região se estender além da imagem, a requisição falhará.
- Ao usar a unidade `percent`, os valores representam porcentagens das dimensões da imagem (por exemplo, `left: 10` significa 10% a partir da borda esquerda).
- O formato de saída corresponde ao formato de entrada.
- A orientação EXIF é aplicada automaticamente antes do recorte, então as coordenadas correspondem à orientação visualmente correta.
