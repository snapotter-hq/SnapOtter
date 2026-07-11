---
description: "Substitua o fundo da imagem por uma cor sólida ou gradiente usando IA."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: a7f8458479e6
---

# Substituir Fundo {#background-replace}

Substitua o fundo de uma imagem por uma cor sólida ou gradiente. O modelo de IA detecta o objeto, remove o fundo original e compõe o objeto sobre o fundo escolhido.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Não | `"color"` | Modo de fundo: `color` ou `gradient` |
| color | string | Não | `"#ffffff"` | Cor hex do fundo (quando backgroundType é `color`) |
| gradientColor1 | string | Não | - | Primeira cor hex do gradiente |
| gradientColor2 | string | Não | - | Segunda cor hex do gradiente |
| gradientAngle | integer | Não | `180` | Ângulo do gradiente em graus (0-360) |
| feather | integer | Não | `0` | Raio de suavização da borda (0-20) |
| format | string | Não | `"png"` | Formato de saída: `png` ou `webp` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Acompanhe o progresso via SSE em `GET /api/v1/jobs/{jobId}/progress`. Quando o trabalho é concluído, o fluxo SSE emite um evento `completed` com a URL de download.

## Observações {#notes}

- Esta é uma ferramenta baseada em IA que retorna `202 Accepted` e processa de forma assíncrona. Conecte-se ao endpoint SSE para receber atualizações de progresso e o resultado final.
- Requer que o pacote de recurso **background-removal** esteja instalado. Retorna `501` se o pacote não estiver disponível.
- Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
- A saída padrão é PNG para preservar a transparência ao redor do objeto.
