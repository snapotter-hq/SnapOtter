---
description: "Desfoque o fundo mantendo o objeto nítido usando IA."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: f63458abc599
---

# Desfocar Fundo {#blur-background}

Desfoque o fundo de uma imagem mantendo o objeto nítido. O modelo de IA isola o objeto, aplica um desfoque ao fundo original e compõe o objeto nítido por cima.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| intensity | integer | Não | `50` | Intensidade do desfoque (1-100) |
| feather | integer | Não | `0` | Raio de suavização da borda (0-20) |
| format | string | Não | `"png"` | Formato de saída: `png` ou `webp` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
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
- Valores de intensidade mais altos produzem um efeito de desfoque mais forte. Valores acima de 80 criam uma separação pronunciada, semelhante a bokeh.
- Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
