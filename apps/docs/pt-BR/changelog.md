---
description: "Notas de versão e histórico de versões do SnapOtter. Veja o que há de novo, o que foi melhorado e o que foi corrigido em cada versão."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: 122334654881
---

# Changelog {#changelog}

## v2.0.0 {#v2-0-0}

O SnapOtter 2.0 transforma o kit de ferramentas de imagem em uma suíte completa de manipulação de arquivos: mais de 200 ferramentas em cinco modalidades (Image, Video, Audio, PDF e Files), reconstruída sobre Postgres 17 e uma fila de jobs baseada em Redis, com um `docker run` de um único comando. Esta é uma versão importante; leia Mudanças incompatíveis antes de atualizar a partir da 1.x.

### Novos recursos {#new-features}

- **Quatro novas modalidades de ferramentas**: Video, Audio, PDF e Files juntam-se a Image, elevando o catálogo para mais de 200 ferramentas.
- **Jobs em segundo plano duráveis**: Uma fila baseada em Redis (BullMQ) executa cada ferramenta como um job rastreado, com progresso ao vivo via SSE.
- **Modo tudo-em-um de contêiner único**: Um único `docker run` inicia uma instância completa com Postgres e Redis embutidos.
- **Pacotes de IA sob demanda**: Remoção de fundo, OCR, transcrição, upscaling, detecção e aprimoramento de rostos, apagador de objetos, colorização e restauração de fotos são instalados pela interface. A aceleração por GPU é detectada por framework.
- **Sign PDF**: Desenhe, digite ou envie uma assinatura e posicione-a em um PDF no navegador.
- **Automate**: Um construtor visual de pipelines que encadeia ferramentas, com nove modelos pré-configurados.
- **83 predefinições de conversão com um clique**: Conversores dedicados de JPG para PNG, MP4 para GIF e semelhantes, com busca aproximada.
- **Editor de imagem baseado em camadas**: Um editor com tecnologia Konva em `/editor` com pincéis, formas, ajustes, filtros e curvas.
- **Biblioteca Files**: Salve qualquer resultado e reutilize-o como entrada de outra ferramenta.
- Ferramentas fixadas, zoom e panorâmica no canvas, 21 idiomas e recursos corporativos (OIDC/SSO, SAML, SCIM, armazenamento S3, permissões por ferramenta, exportação de auditoria, rastreamento distribuído).

### Melhorias {#improvements}

- Cancele um processo em execução. (#137)
- Decodificação RAW em resolução total via LibRaw, incluindo DNG. (#289)
- Implantações não-root e com UID estrangeiro (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Detecção precisa de instalação de IA e um fluxo de instalação reforçado. (#214, #352)
- Reforço de privacidade: nenhum tráfego automático para terceiros, além de um modo estritamente offline opcional.
- Botão de feedback sempre visível, mesmo com a análise de dados desativada.

### Correções de bugs {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` desativa novamente a limitação de taxa para as rotas de ferramentas. (#271)
- Corrigidos os caminhos do virtualenv de IA dentro da imagem Docker. (#390)
- Compatibilidade com sharp 0.35.2+. (#362)
- Correções de layout do editor de imagem: réguas, comportamento de preenchimento, barra lateral e dimensionamento do canvas. (#258, #259)
- Concluída a tradução para o italiano. (#231, #206, #425)
- As ferramentas de normalização e loudnorm de áudio preservam a taxa de amostragem original.
- Reforço contra SSRF: correspondência numérica de CIDR IPv6 e uma pré-varredura de URL ampliada. (#287)
- Os PDFs gerados são marcados com SnapOtter como Producer.
- O mediapipe é instalado no Python 3.13 e no Debian 13.

### Mudanças incompatíveis {#breaking-changes}

A 2.0 substitui o banco de dados SQLite embutido por Postgres 17 e adiciona o Redis 8 para a fila de jobs. Seus dados da 1.x são migrados automaticamente no primeiro boot, mas a pilha de contêineres mudou, então faça backup de todo o seu volume `/data` primeiro (a 1.x roda o SQLite no modo WAL, então os dados confirmados normalmente ficam em `snapotter.db-wal`). Depois escolha a imagem de contêiner único (Postgres e Redis embutidos, apenas root) ou a pilha do Compose (app mais Postgres 17 e Redis 8). Consulte o [guia de migração](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) e o [guia de atualização](/pt-BR/guide/upgrading).

### Atualização {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Ou com o Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo no GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nova ferramenta HTML to Image, acessibilidade WCAG 2.2 AA, reforço de segurança a partir de testes de penetração e 5 correções críticas de Docker.

### Novos recursos {#new-features-1}

- **HTML to Image**: Capture screenshots de URLs ou de HTML bruto como PNG/JPEG/WebP. Capturas de página inteira, viewports personalizados, modo escuro.
- **Convenção de segredos _FILE do Docker**: Monte variáveis de ambiente sensíveis como arquivos em vez de texto puro. (#205)
- **Licenciamento corporativo e armazenamento S3**: Chave de licença comercial opcional e armazenamento de objetos compatível com S3.
- **Melhorias no editor de formas**: Transparência de preenchimento/traço, seletor de cor RGBA, estilos de linha tracejada.
- **Arquivos de versão pré-compilados**: Baixe tarballs das GitHub Releases para instalações sem Docker (Proxmox, bare metal, LXC). (#202)

### Melhorias {#improvements-1}

- **Acessibilidade WCAG 2.2 AA**: Pular navegação, aprisionamento de foco, regiões aria-live, suporte a movimento reduzido, taxas de contraste corretas. (#209)
- **Responsividade em dispositivos móveis**: Configurações responsivas, reconexão automática de SSE ao alternar de aba no celular. (#203, #204)
- **Qualidade da remoção de fundo**: Suavização de bordas, descontaminação de cores, seleção do formato de saída.
- **Tradução para o italiano**: cerca de 145 novas strings por @albanobattistella. (#206)
- **Documentação de API por ferramenta**: 53 páginas de documentação com parâmetros, exemplos e formatos de resposta.
- **Downloads de modelos de IA**: Lógica de repetição com recuo exponencial para o HuggingFace. (#201)

### Correções de bugs {#bug-fixes-1}

- Contêineres Docker recém-criados ficavam completamente inutilizáveis (a limitação de taxa bloqueava todas as requisições).
- As ferramentas de IA de detecção de rostos (blur-faces, red-eye-removal, enhance-faces, passport-photo) falhavam em todas as plataformas.
- Arquivos HEIC quebrados no ARM (incompatibilidade de símbolos do libheif).
- Os pacotes de IA de upscale e restore-photo falhavam na instalação no ARM.
- O OCR usava a versão errada do CUDA em contêineres de GPU.
- Contorno do guard contra SSRF via endereços IPv6 mapeados para IPv4 em hexadecimal. (Crédito: @tonghuaroot)
- Decodificação de HEIC do iPhone com imagens auxiliares. (#183, #199)
- Real-ESRGAN com OOM de CUDA em GPUs de 8GB. (#200)
- 6 erros de produção no Sentry e 7 bugs de QA. (#208)

### Segurança {#security}

- 10 descobertas de teste de penetração corrigidas (contorno de XFF, travamentos por JSON malformado, pipelines sem limite, XSS no log de auditoria, método TRACE e outras). (#207)
- Bloqueado o contorno de SSRF via IPv6 em hexadecimal. (Crédito: @tonghuaroot)
- Imagens base do Dockerfile fixadas por digest.

### Atualização {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Ou com o Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo no GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Demonstração ao vivo, páginas de destino por ferramenta e um lote de correções de refinamento.

### Novos recursos {#new-features-2}

- **Demonstração ao vivo** - [demo.snapotter.com](https://demo.snapotter.com) permite que as pessoas experimentem o SnapOtter sem instalar nada.
- **Página índice de ferramentas** - Navegue por todas as 50+ ferramentas em `/tools` com busca e filtros por categoria.
- **50+ páginas de destino de SEO** - Cada ferramenta agora tem uma página de destino dedicada com FAQs, casos de uso e tabelas comparativas.
- **Prévia de fundo** - Um controle deslizante de antes e depois exibe um fundo quadriculado atrás de imagens transparentes.
- **Gerador de senhas fortes** - Botão de um clique no formulário Adicionar Membros.

### Correções de bugs {#bug-fixes-2}

- A ferramenta de informações de HEIC/HEIF não falha mais (pré-decodificação adicionada).
- A instalação de pacotes de modelos de IA mostra mensagens de erro melhores e respeita os limites de recursos.
- As miniaturas da biblioteca carregam corretamente (os cabeçalhos de autenticação estavam ausentes).
- Os menus suspensos não são mais cortados nas tabelas de configurações de Pessoas e Equipes.
- Percentual de comparação de tamanho oculto em ferramentas que não são de compressão.
- Link duplicado da política de privacidade removido.
- Tradução para o italiano adicionada às configurações de recursos de IA.
- Ícones renomeados do Lucide atualizados (Wand2, Columns).

### Infraestrutura {#infrastructure}

- OpenSSF Scorecard reforçado de 4.3 para cerca de 7.0.
- Testes de CI paralelizados em 4 shards com fixtures reduzidos.
- 41 atualizações de dependências.

### Atualização {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Ou com o Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo no GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Cinco novas ferramentas, um editor de imagem completo, login por SSO, 20 idiomas. Provavelmente deveriam ter sido três versões separadas, mas aqui estamos.

### Novos recursos {#new-features-3}

- **Editor de imagem** - Camadas, pincéis, formas, ajustes, filtros, curvas, atalhos de teclado. Roda no seu navegador, processa no seu hardware.
- **Autenticação OIDC / SSO** - Faça login com Google, GitHub, Okta ou qualquer provedor OpenID Connect. Defina algumas variáveis de ambiente e sua equipe usa as contas que já possui.
- **Gerador de memes** - 100 modelos integrados com renderização de texto via opentype.js. Ou envie a sua própria imagem.
- **Beautify** - Solte uma captura de tela e obtenha uma imagem sofisticada. Molduras de dispositivo (macOS, Windows, navegador), sombras, gradientes, predefinições para redes sociais.
- **Simulação de daltonismo** - Veja como as imagens aparecem com protanopia, deuteranopia, tritanopia e outras deficiências de visão de cores.
- **Corretor de transparência de PNG** - Detecta PNGs com transparência falsa e os corrige com HR-matting do BiRefNet. Remoção opcional de marca d'água via inpainting com LaMa.
- **Expansão de canvas por IA** - Estenda os limites da imagem com preenchimento por IA. Três níveis de qualidade (rápido, equilibrado, qualidade) dependendo de quanto tempo de GPU você quer trocar.
- **20 idiomas** - Árabe, chinês (simplificado/tradicional), tcheco, holandês, francês, alemão, hindi, indonésio, italiano, japonês, coreano, polonês, português, russo, espanhol, tailandês, turco, ucraniano, vietnamita. RTL funciona para o árabe.
- **Importação por URL** - Cole URLs no dropzone ou importe em massa a partir de uma lista. Busca no lado do servidor com proteção contra SSRF.
- **Apagador multiarquivo** - Desenhe máscaras de apagamento em várias imagens e processe todas com um clique. Os traços persistem por imagem.
- **Importação/exportação de pipelines** - Salve cadeias de ferramentas como JSON e compartilhe-as com outras pessoas.
- **17 novos formatos RAW de câmera** via exiftool, mais entrada de QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ e APNG. Novos codecs de saída para BMP, ICO, JP2, QOI. Exportação de AVIF, TIFF, GIF, JXL e PSD recuperada de um branch anteriormente perdido.

### Melhorias {#improvements-2}

- **Aprimoramento de imagem** - Substituímos o pipeline antigo por CLAHE + normalise + gamma. O novo botão Deep Enhance usa o modelo de IA para resultados mais agressivos.
- **Restauração de foto** - Detecção de arranhões reescrita com filtragem Otsu de 8 ângulos. O inpainting com LaMa agora roda em resolução nativa.
- **Formatos exóticos em toda parte** - OCR, image-to-PDF, gerador de favicon, composição, stitch e vetorização agora decodificam HEIC, RAW e PSD.
- **Compress** - Tolerância de tamanho-alvo apertada de 5% para 1%. O tamanho-alvo é o modo padrão. Adicionados botões de incremento e seletor de unidade KB/MB.
- **Limpeza do Sentry** - 644 eventos sem ação filtrados. Erros reais agora tratados corretamente.
- **Detecção de GPU** - Melhor diagnóstico para contêineres onde o CUDA está presente mas o nvidia-smi não está.
- **Modo com autenticação desativada** - Um usuário anônimo é semeado no banco de dados com a função admin. Chaves de API, pipelines e arquivos de usuário não quebram mais em restrições de FK.
- **Mais de 2.705 novos testes** entre unitários, de integração e E2E.

### Correções de bugs {#bug-fixes-3}

- O upscale em CPU não excede mais o tempo limite em servidores NAS e hardware de baixa potência.
- O logotipo do QR code não faz mais a prévia desaparecer permanentemente.
- Estouro de recorte corrigido para imagens de retrato altas.
- Arquivos TIFF com alfa forçam corretamente a saída PNG em vez de produzir corrupção.
- A decodificação de HDR/EXR converte para 8 bits antes do CLAHE, corrigindo falhas de decodificação.
- Buffers de entrada de pontos de referência facial convertidos para PNG antes do sidecar Python, corrigindo travamentos.
- Find duplicates lida com lotes de formatos mistos e erros de rede.
- A prévia do Beautify atualiza em tempo real.
- Barras de progresso para stitch e vetorização.
- SVGZ tratado pelo SVG-to-raster.
- Nomes de arquivo não-ASCII corrigidos via cabeçalho X-File-Results codificado em percent-encoding.

### Atualização {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Ou com o Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo no GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Imagem Docker unificada com detecção automática de GPU. Uma única imagem lida com cargas de trabalho tanto de CPU quanto de GPU. Compose simplificado para um único arquivo com rotação de logs. Os pré-downloads de modelos agora incluem verificação e um teste de fumaça.

---

## v1.13.0 {#v1-13-0}

Controle de acesso baseado em funções (RBAC). 14 permissões granulares, três funções integradas (admin, editor, user), suporte a funções personalizadas. Verificações de permissão em todas as rotas de API. Abas do frontend filtradas pelas permissões do usuário.

---

## v1.12.0 {#v1-12-0}

Ferramenta PDF to Image. Converta páginas de PDF para PNG, JPEG, WebP ou TIFF em DPI personalizado. Imagem Docker unificada com detecção automática de GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt gerado automaticamente via vitepress-plugin-llms para documentação amigável a IA.

---

## v1.10.0 {#v1-10-0}

Redimensionamento com reconhecimento de conteúdo (seam carving) com proteção de rostos. Redimensione imagens preservando o conteúdo importante.

---

## v1.9.0 {#v1-9-0}

Ferramenta Stitch / Combine. Una imagens lado a lado, empilhadas verticalmente ou em uma grade personalizada.

---

## v1.8.0 {#v1-8-0}

Ferramenta Edit Metadata. Visualize e edite metadados EXIF, IPTC e XMP com uma interface granular para remover/manter.

---

## Versões mais antigas {#older-releases}

Para o changelog completo em nível de commit, incluindo versões de correção, consulte as [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
