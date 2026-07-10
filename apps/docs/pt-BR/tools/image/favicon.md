---
description: "Gere todos os tamanhos padrão de favicon e ícones de aplicativo a partir de uma imagem de origem."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 2038fa0e8198
---

# Gerador de Favicon {#favicon-generator}

Gere um conjunto completo de arquivos de favicon e ícones de aplicativo a partir de uma imagem de origem. Produz todos os tamanhos padrão necessários para navegadores, dispositivos Apple e Android, junto com um manifesto web e um trecho de HTML.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Aceita dados de formulário multipart com um ou mais arquivos de imagem e um campo JSON `settings` opcional.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| background | string | Não | - | Cor hexadecimal de fundo (ex.: `"#ffffff"`). Quando definida, o ícone é achatado sobre essa cor. |
| padding | integer | Não | `0` | Percentual de preenchimento ao redor do conteúdo do ícone (0 a 40) |
| radius | integer | Não | `0` | Percentual de raio de canto para ícones arredondados (0 a 50) |
| sizes | integer[] | Não | - | Restringe a saída a tamanhos específicos em pixels (ex.: `[16, 32, 180]`). Omita para gerar todos os tamanhos padrão. |
| themeColor | string | Não | `"#ffffff"` | Cor de tema hexadecimal para o manifesto web |

## Arquivos Gerados {#generated-files}

Para cada imagem de entrada, os seguintes arquivos são produzidos:

| Arquivo | Tamanho | Finalidade |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Ícone da aba do navegador |
| `favicon-32x32.png` | 32x32 | Ícone da aba do navegador (HiDPI) |
| `favicon-48x48.png` | 48x48 | Atalho de desktop |
| `apple-touch-icon.png` | 180x180 | Tela inicial do iOS |
| `android-chrome-192x192.png` | 192x192 | Tela inicial do Android |
| `android-chrome-512x512.png` | 512x512 | Tela de splash do Android |
| `favicon.ico` | 32x32 | Formato ICO legado |
| `manifest.json` | - | Manifesto de aplicativo web com referências de ícones |
| `favicon-snippet.html` | - | Tags de link HTML prontas para uso |

## Exemplo de Requisição {#example-request}

Imagem de origem única com cantos arredondados e preenchimento:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Várias imagens de origem (cada uma recebe seu próprio conjunto em uma subpasta):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Exemplo de Resposta {#example-response}

A resposta é um arquivo ZIP transmitido diretamente. Os cabeçalhos da resposta são:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Trecho de HTML Incluído {#html-snippet-included}

O ZIP inclui um arquivo `favicon-snippet.html` que você pode colar no `<head>` do seu HTML:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Observações {#notes}

- As imagens de origem são redimensionadas usando o modo de ajuste `cover`, ou seja, são recortadas para preencher cada tamanho quadrado. Para melhores resultados, use uma imagem de origem quadrada.
- Quando vários arquivos são enviados, cada um recebe sua própria subpasta no ZIP (nomeada de acordo com o arquivo de origem).
- Para o envio de um único arquivo, todas as saídas ficam na raiz do ZIP sem subpasta.
- Arquivos que falham na validação ou na decodificação são ignorados, e um `skipped-files.txt` é incluído no ZIP explicando os problemas.
- Formatos de entrada suportados: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD e outros.
- A orientação EXIF é aplicada automaticamente antes do redimensionamento.
