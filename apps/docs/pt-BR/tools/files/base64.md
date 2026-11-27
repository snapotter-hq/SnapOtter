---
description: "Codifica texto em Base64 ou decodifica Base64 de volta para texto."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: 536eb814dff9
i18n_hash_version: 2
---

# Codificar / Decodificar Base64 {#base64}

Cole um texto para obter Base64, ou cole Base64 para recuperar o texto, e depois copie o resultado. O texto vai para o seu próprio servidor SnapOtter e para nenhum outro lugar.

Para transformar uma imagem em Base64, use [Imagem para Base64](/pt-BR/tools/image/image-to-base64).

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/base64`

Aceita um corpo JSON, não dados de formulário multipart, e responde com o texto convertido em vez de um arquivo para download.

## Parâmetros {#parameters}

| Nome | Tipo | Padrão | Descrição |
|------|------|---------|-------------|
| `text` | string | (obrigatório) | Texto a codificar, ou Base64 a decodificar. Até 1.000.000 de caracteres. |
| `mode` | string | (obrigatório) | `encode` ou `decode`. |
| `urlSafe` | boolean | `false` | Ao codificar, usa o alfabeto seguro para URLs (`-` e `_`) e omite o preenchimento `=`. Ignorado ao decodificar. |

## Exemplo de Requisição {#example-request}

Codificar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Decodificar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notas {#notes}

- O texto é codificado como UTF-8, então letras acentuadas, CJK e emoji fazem a ida e a volta intactos.
- A decodificação ignora espaços e quebras de linha, então Base64 quebrado em 76 colunas (e-mail, corpos PEM) é decodificado como foi colado.
- A decodificação aceita entrada com ou sem preenchimento `=`, no alfabeto padrão (`+`, `/`) ou no seguro para URLs (`-`, `_`), mas não em uma mistura dos dois.
- Entrada que não é Base64 falha com um 400 e o código `ENCODED_TEXT_INVALID`. Base64 válido que decodifica para dados binários (uma imagem, um ZIP) em vez de texto UTF-8 falha com `DECODED_DATA_NOT_TEXT`.
