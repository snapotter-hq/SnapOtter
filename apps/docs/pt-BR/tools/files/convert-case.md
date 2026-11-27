---
description: "Muda o texto para MAIÚSCULAS, minúsculas, Título, Frase e mais."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: cb1398c7eb88
i18n_hash_version: 2
---

# Converter Maiúsculas e Minúsculas {#convert-case}

Cole um texto, escolha um formato e copie o resultado. O texto vai para o seu próprio servidor SnapOtter e para nenhum outro lugar.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Aceita um corpo JSON, não dados de formulário multipart, e responde com o texto convertido em vez de um arquivo para download.

## Parâmetros {#parameters}

| Nome | Tipo | Padrão | Descrição |
|------|------|---------|-------------|
| `text` | string | (obrigatório) | Texto a converter. Até 1.000.000 de caracteres. |
| `mode` | string | (obrigatório) | Um dos modos abaixo. |
| `locale` | string | (nenhum) | Tag de idioma BCP 47, como `tr` ou `de`, para letras cuja caixa depende do idioma. Sem ela, a caixa é a mesma para todos os idiomas. |

| Modo | Entrada | Saída |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notas {#notes}

- `title` mantém em minúsculas as palavras curtas em inglês (a, an, and, of, the, to e semelhantes), a menos que iniciem ou terminem a linha. `capitalized` coloca em maiúscula todas as palavras.
- `sentence` inicia uma nova frase no começo do texto, após uma quebra de linha e após `.`, `!`, `?` ou `…` seguido de um espaço, então o ponto em `snapotter.com` ou `3.5` não conta.
- `camel`, `pascal`, `snake` e `kebab` dividem em espaços, pontuação e mudanças de caixa existentes (`XMLHttpRequest` vira `xml_http_request`) e convertem cada linha separadamente.
- Com `locale` definido como `tr`, `i` em maiúsculas vira `İ` e `I` em minúsculas vira `ı`. O `ß` alemão vira `SS` em maiúsculas em todas as localidades.
- O aplicativo web envia seu idioma de interface atual como `locale`.
