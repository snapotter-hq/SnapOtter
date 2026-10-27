---
description: "Notas de versão e histórico de versões do SnapOtter. Veja o que há de novo, o que foi melhorado e o que foi corrigido em cada versão."
i18n_source_hash: d3c5fc4c6b75
i18n_provenance: human
i18n_output_hash: b322400998ca
---

# Changelog {#changelog}

## v2.2.0 {#v2-2-0}

A maior parte da 2.2 é reforço de segurança. Um usuário não administrador com um papel delegado `users:manage` podia assumir o controle de uma instância, e todos os endpoints de ferramentas estavam sem verificação de permissão. Atualize se você tiver mais de um usuário.

O resto é a longa cauda da auto-hospedagem: downloads que começavam e nunca terminavam, predefinições que quebravam no momento em que você adicionava um segundo arquivo, contêineres em ciclo de falhas enquanto o Postgres ainda estava subindo. Duas novas ferramentas também chegaram. A documentação e o site agora estão traduzidos em 21 idiomas, e a interface finalmente atende ao contraste WCAG AA.

> [!IMPORTANT]
> Se você concedeu `users:manage` a um não administrador por meio de um papel personalizado, esse papel podia assumir contas de administrador nas versões 2.0.0 a 2.1.0. Detalhes em Segurança.

### Segurança {#v2-2-0-security}

- **Escalação de privilégios por um papel delegado `users:manage` (GHSA-9xgh-95qh-2x7h).** Um usuário não administrador com `users:manage` por um papel personalizado podia redefinir a senha ou excluir uma conta de privilégio superior, incluindo um administrador integrado, e assumir a instância. A redefinição de senha e a exclusão de conta agora verificam a autoridade de quem chama sobre o alvo, então um papel delegado não consegue alcançar acima do próprio nível. Afetadas: 2.0.0 a 2.1.0. Reportado por 李春来 (Chunlai Li). (#616)
- **Todos os endpoints de ferramentas agora têm verificação.** O acesso às ferramentas era aplicado rota por rota, então as 45 rotas escritas à mão precisavam lembrar da mesma chamada e nenhuma delas lembrava. Um papel sem `tools:use` ainda conseguia executar image-to-pdf, erase-object, upscale, sign-pdf e o resto. A verificação agora fica em um único preHandler baseado na rota correspondente, então ela cobre subcaminhos e qualquer rota adicionada depois. (#646)
- **A limitação de taxa podia ser contornada em instalações Docker.** A imagem trazia `TRUST_PROXY=true`, então o IP do cliente vinha de um cabeçalho da requisição e um `X-Forwarded-For` forjado passava pelo limitador de login. O padrão agora é uma lista de confiança de rede privada. (#649)
- **Gravações de configurações são verificadas por configuração**, não uma vez na entrada, e a importação de configuração agora é transacional, para que uma chave rejeitada não deixe metade de uma configuração aplicada. (#618)
- **Nomes de arquivos da biblioteca não podem escapar da raiz de armazenamento.** Um nome armazenado forjado, que uma importação maliciosa de SQLite da 1.x copia literalmente, podia ler ou excluir arquivos fora do diretório de arquivos. Só é alcançável depois que um operador importa um banco SQLite 1.x fornecido por um atacante, que é o único caminho que permite escolher um nome armazenado. Reportado por @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **O cancelamento de jobs aplica a verificação de propriedade**, então um usuário autenticado não pode mais cancelar o job de outro usuário pelo id. Reportado por @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Uma reauditoria de toda a árvore 2.0 encontrou o que ainda estava aberto**: uma asserção SAML capturada podia ser reproduzida, um desafio de MFA sobrevivia a qualquer número de códigos errados, a consulta de chave de API por requisição era uma varredura completa de tabela, `MAX_WORKSPACE_SIZE_GB` era configuração morta, e o sanitizador de SVG deixava passar hrefs `javascript:` sem aspas. (#620)
- **Nove CVEs divulgadas corrigidas**: fast-uri, svgo, sharp e tar transitivamente (#619), além do Pillow 12.3.0 (#517). A decodificação RAW em arm64 agora compila o LibRaw 0.22.2 a partir do código-fonte em vez de vincular uma cópia do sistema sem patch. (#649)

### Novos recursos {#v2-2-0-new-features}

- **Recorte Arredondado**: máscaras de quadrado arredondado e squircle no estilo iOS, com um controle de raio de canto. Feito para favicons e ícones de aplicativos. (#602)
- **Remover Fundo de GIF**: retire o fundo de um GIF animado, WebP ou APNG quadro a quadro e receba de volta uma animação transparente. (#502)
- **Laço e modo de Alta Qualidade no Apagador de Objetos**: arraste um laço de forma livre em vez de pintar cada pixel, e opcionalmente instale um pacote de inpainting por difusão para preenchimentos mais limpos de áreas grandes. (#503, #566)
- **Salvar como novo ou substituir.** Editar um arquivo da biblioteca costumava substituir o original silenciosamente. Agora você escolhe por edição, e o padrão mantém o original. (#564, #577)
- **Predefinições de proporção em Redimensionar.** Escolha 1:1, 4:3 ou 16:9 e as duas dimensões permanecem travadas, sem ampliar. (#530)
- **OCR em duas camadas**: uma camada rápida vem embutida na imagem e roda offline sem download, e um tempo de execução mais preciso é instalado sob demanda. (#519)
- **Digite em qualquer lugar para pesquisar.** Comece a digitar no painel ou na página inicial e o texto vai para a caixa de pesquisa. (#644)
- **Documentação e site em 21 idiomas**: o site de documentação, as páginas de destino e a referência da API estão todos traduzidos agora, juntando-se à interface do aplicativo. Um novo guia de implantação para recursos limitados cobre Raspberry Pi e máquinas de 2 GB. (#548)
- **Nomes de ferramentas mais claros**: 18 nomes ambíguos agora se qualificam sozinhos, então "Compress" virou "Compress Image". IDs e rotas de ferramentas não mudaram, então nada favoritado quebra. (#520)

### Melhorias {#v2-2-0-improvements}

- **Contraste WCAG AA em toda a interface**: a paleta foi recalibrada para que o laranja vivo fique nos preenchimentos enquanto textos e rótulos usam tokens de cor acessíveis, e todos os 57 indicadores de foco agora superam o limite de 3:1 para elementos não textuais. (#567, #574)
- **Ampliação e remoção de fundo deixam de parecer travadas**: a barra de progresso avança durante a inferência em vez de estacionar em 30%, e ambas as ferramentas agora avisam que um host somente CPU é muito mais lento. (#605, #608)
- **Mensagens de tempo limite nomeiam a causa real** e consideram hosts somente CPU em vez de culpar o upload. (#596)
- **O SnapOtter espera pelo Postgres e pelo Redis na inicialização** em vez de entrar em ciclo de falhas, tanto no Compose quanto na imagem tudo-em-um. Uma instalação em LXC no Proxmox reiniciava 76 vezes antes disso. (#537, #595)
- **Downloads sobrevivem a um proxy reverso**: o SnapOtter pede ao nginx e a proxies compatíveis que não façam buffer das respostas de arquivo, que é o motivo usual para um download auto-hospedado começar e nunca terminar. (#604, #607)
- **Comprimir PDF fica perto do tamanho alvo**, e diz isso honestamente quando um alvo é inalcançável. (#522)
- **Controles de ferramentas no celular continuam acessíveis** agora que as estruturas do aplicativo se dimensionam pela viewport dinâmica. (#559)
- **Converter Áudio expõe uma configuração de taxa de amostragem.** (#561)
- **Administradores podem relaxar o comprimento mínimo de senha**, até 1 para uma instância em LAN confiável. (#543)
- **A MFA agora é de autoatendimento**, o bloqueio causado pela política foi resolvido, e logins OIDC ou SAML recebem um desafio de MFA real em vez de um bloqueio rígido. (#531, #536)
- **Um `Error: Error` simples agora nomeia sua causa.** Falhas de codificação do Sharp, saídas do sidecar de IA, saída não JSON do sidecar de documentos e falhas de remoção de fundo chegavam com o motivo apagado. (#532, #534, #535, #538, #612)
- **O diálogo de ajuda está traduzido.** Seus rótulos de atalho e texto de introdução estavam fixos em inglês enquanto traduções prontas ficavam sem uso nos 21 arquivos de localidade. (#647)

### Correções de bugs {#v2-2-0-bug-fixes}

- **Arquivos HEIC de iPhone eram rejeitados** como ilegíveis antes de chegarem ao decodificador que os trata. (#631)
- **Predefinições de conversão falhavam com um segundo arquivo**: jpg-to-pdf e seus irmãos image-to-pdf, além de pdf-to-png, pdf-to-jpg e pdf-to-tiff, retornavam `Tool not found` assim que você enviava dois arquivos. (#633, #643)
- **Predefinições de conversão de PDF perdiam o botão de download.** (#629)
- **Um tempo limite de processamento ilimitado não era respeitado**, e streams de progresso travados agora se recuperam em vez de deixar a interface esperando. (#638)
- **Downloads travavam em vez de falhar** quando um arquivo armazenado era menor que o comprimento registrado. (#617)
- **Ferramentas de páginas de PDF falhavam em arquivos curtos e criptografados**: Remover Páginas usava como padrão um intervalo de páginas que nenhum documento com menos de seis páginas tem, e PDFs protegidos por senha falhavam de forma críptica dentro do worker. (#594)
- **PDF para Texto retornava silenciosamente um arquivo vazio** para PDFs digitalizados. Agora ele indica o OCR e entrega texto como UTF-8. (#603)
- **PDF para Word descartava blocos de texto coloridos** e os dividia pela página. (#500)
- **O Apagador de Objetos deixava resquícios fantasma** e desfocava objetos pequenos em imagens de alta resolução. (#501)
- **Estabilizar Vídeo gerava saída não reproduzível** sem faststart. (#593)
- **Reparos no editor de imagem**: girar, inverter, redimensionar, níveis, curvas, filtros e bloqueio de camada. (#597)
- **Assinar PDF mostrava um canvas em branco** em vez de informar por que um PDF não carregou. (#545)
- **A biblioteca de arquivos registrava dimensões 0x0** e pulava as pré-visualizações de uploads HEIC, RAW e PSD. (#636, #637)
- **Instalar mais de um pacote de IA** deixava o virtualenv compartilhado com múltiplas versões e quebrava silenciosamente três ferramentas. (#649)
- **Converter para JXL com qualidade 1 a 4 retornava um 500**, e um ffmpeg ausente era reportado a você como upload corrompido. (#649)
- **Uma indisponibilidade transitória do Postgres deixava jobs concluídos presos**, deixando a saída no disco sem nenhuma linha apontando para ela. Um reconciliador agora adota esse trabalho em vez de descartá-lo. (#649)
- **Um endpoint Redis que mudava de endereço travava todos os consumidores** enquanto as verificações de saúde ainda respondiam 200. (#649)
- **Correções no site e na documentação**: links localizados não perdem mais fragmentos `#` nem colocam `zh-CN` em minúsculas, a navegação da documentação permanece dentro da viewport em tablets, e nenhum dos sites chama a API do GitHub pelo seu navegador. (#516, #562, #570, #560)

### Notas de atualização {#v2-2-0-upgrade-notes}

Nada para migrar, mas dois padrões enviados mudaram:

- **`TRUST_PROXY` agora tem como padrão `loopback,linklocal,uniquelocal`** em vez de confiar em qualquer par. Redes bridge do Docker e do Compose ficam dentro desse intervalo, então a maioria das configurações não precisa de mudança. Se o seu proxy reverso alcança o SnapOtter a partir de um endereço público, defina `TRUST_PROXY` explicitamente, ou a limitação de taxa e os logs de auditoria atribuirão cada requisição ao proxy.
- **`MAX_AI_JOBS_PER_USER` tem como padrão 5** jobs de IA de arquivo único em andamento por usuário. Execuções de IA em lote e em pipeline continuam sem limite.

Novos ajustes opcionais: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (desligado por padrão) e `GIF_BG_MAX_FRAMES`.

### Agradecimentos {#v2-2-0-acknowledgements}

Boa parte desta versão começou como o relatório de bug de outra pessoa.

Código e contribuições:

- **@mvanhorn** ❤️: Reescreveu a falha de tempo limite da remoção de fundo em uma mensagem que diz o que fazer a respeito, em vez de um tempo limite seco. (#518, #494)
- **@EuanTop** ❤️: Restaurou a ação de download nas páginas de predefinição de conversão de PDF fazendo a rota síncrona retornar o contrato padrão de resultado de ferramenta. (#629, #623)
- **@harshjainnn** ❤️: Diagnosticou o download que começa e nunca termina, e propôs a direção de reset de socket sobre a qual a correção foi construída. (#617, #590)

Divulgações de segurança:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Divulgou de forma privada a escalação de privilégios por um papel delegado `users:manage`, com uma análise completa da origem ao destino e uma cadeia de exploração funcional. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Divulgou um IDOR autenticado no cancelamento de jobs, e um path traversal em nomes de arquivos armazenados na biblioteca alcançável após uma importação maliciosa de SQLite da 1.x, com uma prova de conceito funcional para cada um. (#599, #600)

Relatos de bugs:

- **@riz467** ❤️: Arquivos HEIC reais de iPhone rejeitados na validação, com a causa raiz esclarecida no relatório. (#622)
- **@coupej** ❤️: Páginas de predefinição de PDF travando para sempre, e jpg-to-pdf falhando assim que um segundo arquivo era adicionado. Dois bugs distintos, corretamente separados. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` documentado como ilimitado mas limitado a cinco minutos. (#630)
- **@bezibaerchen** ❤️: Converter Áudio escondia a configuração de taxa de amostragem que sua própria descrição prometia. (#558)
- **@hell-toupee** ❤️: O pacote OCR preciso falhando na instalação com um erro `libpaddle`. (#505)
- **@Michael1260** ❤️ e **@And-CSH** ❤️: Confirmaram essa falha de instalação do OCR de forma independente e estabeleceram que a extração manual funciona enquanto o instalador do aplicativo não, o que fixou o bug no instalador. (#505)
- **@TomErnst1972** ❤️: Ativar a política de MFA obrigatória bloqueando um administrador da própria instância. (#515)
- **@thokich** ❤️: O apagamento de objetos produzindo preenchimentos desfocados e inutilizáveis, o que impulsionou tanto a reescrita do inpainting HD quanto o pacote opcional de alta qualidade. (#141)
- **@Hennie-git** ❤️: Uma instalação em LXC no Proxmox reiniciando 76 vezes contra um Postgres que ainda não aceitava conexões. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (community-scripts do Proxmox VE): Triou esse relatório em tempo real e produziu o diagnóstico sobre o qual a correção de inicialização foi construída. (#537)

Solicitações de recursos e feedback:

- **@LECOQQ** ❤️: Pediu para relaxar a complexidade de senha em uma instalação de servidor doméstico. (#136)
- **@killervette42** ❤️: Pediu um Unraid Community App, agora publicado na loja Unraid CA. (#96)
- **@alienatedsec** ❤️: Apontou que a correção de fallback de GPU para CPU estava enterrada em uma issue fechada e era impossível de descobrir, e é por isso que ela está na documentação de implantação agora. (#490, #587)
- **@neilp316** ❤️: Confirmou a falha da GPU Blackwell em uma RTX 5060 e mapeou um caminho de atualização funcional para CUDA 12.8. (#120)
- **@Roiki11** ❤️: Defendeu armazenamento compartilhado com referências de caminho em vez de transferência de arquivos por HTTP para computação de IA fora da máquina. (#189)

Agradecemos também aos membros da comunidade que relataram esses problemas no Discord e por e-mail, cujos nomes não registramos: o pedido de recorte squircle (#602), o download de imagem para PDF que começava e nunca terminava (#604, #607), a ferramenta Excluir Páginas travando (#594), texto em árabe ausente no pdf-to-text (#603), e o diagnóstico por trás do fallback de GPU do ONNX (#490).

[Diff completo no GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

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
