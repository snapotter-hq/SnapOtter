---
description: "Notas de versão e histórico de versões do SnapOtter. Veja o que há de novo, o que melhorou e o que foi corrigido em cada versão."
i18n_source_hash: 952098c65251
i18n_provenance: machine
i18n_output_hash: eeaa6be8cafc
i18n_hash_version: 2
---

# Changelog {#changelog}

## v2.3.0 {#v2-3-0}

O SnapOtter acabou de passar de um milhão de pulls de imagem entre Docker Hub e GHCR, e de 3.000 estrelas no GitHub. São muitos servidores self-hosted, então esta versão é o nosso agradecimento a todos que os mantêm.

Atualize logo. A 2.3.0 corrige seis avisos de segurança, um deles de gravidade alta. Os detalhes estão na seção Segurança abaixo.

Além das correções, há ferramentas novas: um editor de páginas PDF Multi-Tool, predefinições de compressão para um tamanho-alvo com um clique para imagens e PDFs, e ordenação de páginas por arrastar e soltar no Organize PDF. O OCR agora lê árabe, e o pdf-to-text oferece OCR quando encontra um PDF escaneado. O SnapOtter pode rodar sob um subcaminho como `/snapotter` atrás de um proxy reverso. O app não precisa mais de um superusuário do Postgres para funcionar. Administradores que ficarem bloqueados podem se recuperar pela linha de comando. O restante são cerca de 1.400 correções, a maioria para problemas que você relatou.

> [!IMPORTANT]
> Todos os seis avisos abaixo afetam a 2.2.0, e alguns remontam à 2.0.0. Se você compartilha uma instância com outros usuários ou a expõe além da sua própria rede, atualize.

### Segurança {#v2-3-0-security}

- **Uploads de SVG podiam pular a sanitização (GHSA-9c7h-xjrp-8gh3, alta).** Um SVG rejeitado pelo decodificador de imagens era armazenado e servido como estava, em vez de ser sanitizado. Afetadas: 2.2.0 e anteriores. Relatado por @xaferima. (#1211)
- **O stream de progresso dos jobs não verificava quem estava perguntando (GHSA-ff22-w6x2-fm98, média).** Agora exige login e propriedade do job. Afetadas: 2.0.0 a 2.2.0. (#1750)
- **Os links de download de resultados também serviam o upload original (GHSA-jgv3-2jc6-f628, média).** Afetadas: 2.2.0 e anteriores. Relatado por @emirhancatkin. (#3623)
- **Foto de passaporte e efeitos de fundo confiavam em um id de job fornecido pelo cliente (GHSA-3c8g-8v4x-qq9j, média).** Afetadas: 2.2.0 e anteriores. Relatado por @shaoyuuuuu. (#3623)
- **Importação por URL, upload e pré-visualização pulavam as verificações de permissão de função e de chave de API (GHSA-8xxr-g2w8-7f9r, média).** Afetadas: 2.2.0 e anteriores. Relatado por @nguyenvantiennani. (#3780, #707)
- **A exigência de SSO revelava o nome de usuário de emergência (GHSA-q6fg-vvw9-cr8r, baixa).** Um login local recusado agora recebe o mesmo 401 de qualquer outro login com falha. Afetadas: 2.0.0 a 2.2.0. (#2148)
- **O Postgres não roda mais como superusuário.** O app agora se conecta com uma função que só pode ler e gravar dados. As migrações usam uma conexão separada e opcional. Veja as Notas de atualização. (#918)
- **Dependências corrigidas**: os pisos de override de dompurify e handlebars foram elevados para as versões corrigidas. (#4247)

### Novos recursos {#v2-3-0-new-features}

- **PDF Multi-Tool**: um editor de páginas que reordena, duplica, gira e exclui páginas, e traz páginas de outros PDFs. O servidor monta o arquivo final. (#1338)
- **Compressão para um tamanho-alvo com um clique**: cinco predefinições para imagens (20, 50, 100, 200, 500 KB) e cinco para PDFs (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **Execute o SnapOtter sob um subcaminho**: defina `BASE_PATH=/snapotter` e a mesma imagem passa a servir a partir dele. Links de resultado, cookies, redirecionamentos de SSO e a documentação da API acompanham o subcaminho. (#1252, #1324)
- **OCR em árabe**: escolha árabe explicitamente ou deixe o modo automático detectá-lo. Funciona no OCR de imagens e de PDFs. (#4130, #4183)
- **O pdf-to-text oferece OCR** quando um PDF, ou um lote inteiro, não tem camada de texto, em vez de devolver um arquivo vazio. (#4142, #4198)
- **Ordenação de páginas por arrastar e soltar no Organize PDF**, com mouse e toque. (#1249, #2601)
- **Reordene os arquivos antes de uma execução com vários arquivos**: merge, stitch, collage e as demais ferramentas de vários arquivos mantêm a ordem que você definiu. (#756, #757)
- **Cancele execuções em lote e de pipeline**, e o trabalho realmente para no servidor. (#807)
- **Comandos de recuperação de `snapotter-admin`**: `reset-password`, `create-admin`, `unlock-user` e redefinição de MFA, para administradores bloqueados fora da interface web. (#4016)
- **Cadastro de MFA no login**: quando a MFA é exigida, usuários que não a têm a configuram na hora, em vez de serem bloqueados.
- **Captura pela câmera e app instalável**: tire uma foto direto para uma ferramenta no celular e instale o SnapOtter como PWA. (#773)
- **Preenchimento transparente na caixa de diálogo Tamanho da tela do editor.** (#4111)
- **Avisos de atualização para administradores**: quando há um SnapOtter mais novo, os administradores veem um aviso dispensável com um link para as notas de versão. A verificação passa pela conexão de análises existente, então fica desativada quando as análises estão desativadas.

### Melhorias {#v2-3-0-improvements}

- **A remoção de fundo é mais rápida em execuções repetidas**: o modelo permanece carregado entre as requisições, em vez de recarregar toda vez. (#4144)
- **Uploads em lote usam muito menos memória**: cada arquivo vai para o disco temporário e é processado um de cada vez, em vez de ficar na RAM. (#2687)
- **As instalações de bundles de IA falham de forma limpa e fazem rollback**, em vez de deixar um venv pela metade. As instalações de remoção de fundo no Proxmox LXC voltam a funcionar, e hosts com pouca memória recebem limites de CPU sensatos antes de um job começar. (#2628, #2597, #2526, #2546)
- **A detecção de GPU é mais confiável**: o CUDA é detectado pelo driver, placas da série RTX 50 recorrem à CPU em vez de falhar, e os codificadores de vídeo por hardware são testados antes do uso. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` agora funciona**. Ele era lido, mas nunca aplicado. (#3249)
- **Ferramentas longas recebem o tempo limite longo**: pdf-to-word, compress-pdf, convert-document e o redimensionamento com reconhecimento de conteúdo não estouram mais o tempo cedo demais em arquivos grandes. (#3276)
- **O Compress PDF mantém os escaneados legíveis** e avisa quando não é possível atingir um tamanho-alvo, em vez de produzir um arquivo ilegível. (#4112)
- **Logins com falha são limitados por nome de usuário**: mais de dez em quinze minutos resultam em um 429 com `Retry-After`. (#827)
- **Os erros dizem o que deu errado**: binários ausentes, falhas de armazenamento, encerramentos por falta de memória e limites de upload agora recebem mensagens específicas, em vez de um 500 ou 422 genérico.
- **O log de auditoria cobre execuções de ferramentas, lotes e pipelines**, e os eventos de usuário, função, equipe e LGPD/GDPR registram quem fez o quê a quem. (#3991, #3984)
- **O contêiner all-in-one para em um primeiro boot ruim**, em vez de reiniciar para sempre, e o Postgres e o Redis embutidos têm prazos de inicialização. (#3008, #1130)
- **Datas e plurais seguem o seu idioma**, e as últimas strings em inglês fixas no código foram traduzidas.
- **Refinamentos para celular e editor**: layouts de slider, Sign PDF e recorte em telefones, arrastar por toque, pincéis de pixel mais rápidos, e Níveis e Curvas no desfazer e no salvamento automático.

### Correção de bugs {#v2-3-0-bug-fixes}

- **O Adjust Colors combinava as configurações de forma errada**: temperatura, saturação, matiz, contraste e sépia se sobrescreviam em vez de se acumularem. (#3153, #3120, #3469)
- **O Pixelate não pixelava**, e a saída PNG tinha a paleta reduzida silenciosamente nas ferramentas de imagem. (#709, #716)
- **GIF e WebP animados perdiam quadros** em várias ferramentas, e as paletas e a transparência dos GIFs saíam erradas. (#1184, #1225, #3407, #2573)
- **Uploads girados perdiam qualidade**: a orientação automática descartava a codificação sem perdas, a transparência e a profundidade de 16 bits. O WebP animado agora gira todos os quadros. (#2384, #2529)
- **TIFFs com transparência, arquivos HEIF AV1 e vários formatos RAW** falhavam ou perdiam o alfa. (#2609, #2572, #1120)
- **Redimensionar o canvas do editor escalava a imagem** em vez de adicionar espaço ao redor dela. (#2081)
- **Os nomes dos arquivos de saída ficavam desfigurados**: `.jpeg` e `.tif` viravam outra coisa, e dotfiles ou nomes que repetem a própria extensão quebravam. (#3495, #3382)
- **O salvamento automático da biblioteca ignorava a cota de armazenamento**, e os contadores de armazenamento podiam ficar negativos. (#2389, #2585)
- **Jobs travados após uma reinicialização** agora são resolvidos na inicialização, em vez de mostrar "processando" para sempre. (#3219, #3193)
- **O login OIDC dava o nome "admin" a todo novo usuário**, e os logins no Safari do iOS terminavam em uma página de erro depois de darem certo. (#862, #4021)
- **Regras de senha desativadas ainda eram aplicadas** ao criar usuários. (#1028)
- **PDFs danificados travavam por 30 segundos** antes de falhar. (#920)
- **A verificação de disco do bundle de IA pedia cerca de 18 GB** para instalar um único bundle. (#1248)
- **O Compress Video falhava em gravações de tela com taxa de quadros variável.** (#2427)
- **A remoção de fundo em lote perdia resultados já concluídos** quando o navegador repetia a requisição. (#2015)
- **Os campos numéricos das Configurações não podiam ser apagados** durante a digitação. (#1449)
- **Desativar as análises deixava eventos na fila para serem enviados** cerca de 30 segundos depois. Agora eles são descartados quando você opta por sair. (#4270)

### Notas de atualização {#v2-3-0-upgrade-notes}

As migrações rodam sozinhas na inicialização. Você não precisa executar nenhum SQL.

- **Funções do banco de dados.** O arquivo Compose canônico agora dá ao app uma função que só pode ler e gravar dados (`DATABASE_URL`) e uma conexão privilegiada separada (`DATABASE_MIGRATION_URL`), usada apenas na inicialização para migrações e permissões. Um arquivo Compose existente continua funcionando como antes: deixe `DATABASE_MIGRATION_URL` sem definir e o SnapOtter roda com uma única função. Para uma implantação não local, defina `POSTGRES_APP_PASSWORD` junto com `POSTGRES_PASSWORD`.
- **Verificações de inicialização mais rígidas.** Antes, estas falhavam mais tarde ou em silêncio. Agora elas param o contêiner com uma mensagem que cita a variável: um `DEFAULT_LOCALE` não suportado (use um código suportado como `de`, não `de_DE`), `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL` ou `OIDC_ISSUER_URL` malformados quando o SSO está ativado, uma lista `TRUST_PROXY` inválida, um `BASE_PATH` incorreto e um `LOG_DIR` sem permissão de escrita.
- **`TRUST_PROXY` não aceita mais uma contagem de saltos.** Um número como `TRUST_PROXY=2` agora para o contêiner na inicialização, em vez de silenciosamente não confiar em nenhum proxy. Defina-o com os endereços ou intervalos nomeados do proxy (o padrão é `loopback,linklocal,uniquelocal`), `false` quando nada fica à frente do SnapOtter, ou `true` somente quando um proxy sob seu controle está à frente em um endereço público. (#998)
- **`MAX_WORKER_THREADS` agora tem efeito.** Se você o definiu e não viu mudança antes, verá agora.
- **Códigos de status da API.** Falhas de engine e de armazenamento retornam 503 `ENGINE_UNAVAILABLE` (os endpoints em lote retornavam 422). Uploads acima do limite retornam 413 (era 400). `clientJobId` malformado retorna 400 e um reutilizado retorna 409 (era 500). Reexecutar o seu próprio lote de pipeline retorna 202. `mode=targetSize` sem `targetSizeKb` retorna 400. Um login local recusado sob exigência de SSO retorna 401 em vez de 403 `SSO_ENFORCED`. Logins limitados retornam 429 `LOGIN_THROTTLED`. O resultado de remove-background não inclui mais `originalUrl`.
- **Novas variáveis opcionais**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (15 minutos por padrão, `0` desativa), `EMBEDDED_REDIS_TIMEOUT_S` (180) e `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **Os arquivos Compose acompanham a versão.** `docker-compose.yml` e `docker-compose-gpu.yml` estão anexados a esta versão, então você pode baixá-los direto da página da versão.

### Agradecimentos {#v2-3-0-acknowledgements}

Um milhão de pulls significa muita gente relatando bugs, enviando correções e nos dizendo o que faltava. Esta versão é, em grande parte, trabalho dessas pessoas.

Código e contribuições:

- **@zakka258** ❤️: Construiu o editor de páginas PDF Multi-Tool e a implantação em subcaminho, dois dos maiores recursos desta versão, incluindo os testes de autenticação e SSO sob um subcaminho. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Construiu as predefinições de compressão para um tamanho-alvo com um clique para imagens, corrigiu a concorrência e a limpeza das pré-visualizações, e impediu que o armazenamento bloqueado do navegador travasse o spinner de login. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Adicionou a reordenação de páginas por arrastar e soltar ao Organize PDF, que ele já havia pedido nas Discussions. (#1249, #965)
- **@drakeo338** ❤️: Dez correções em toda a stack, incluindo a orientação automática mantendo formato e qualidade, grupos SCIM criados em uma única transação, instalações de IA sob cgroup v2, e erros 5xx não mais mascarados como 422. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Adicionou preenchimento transparente do canvas ao editor, corrigiu vereditos desatualizados de tamanho-alvo no Compress PDF e permitiu atualizações parciais de equipes. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Impediu que instâncias self-hosted enviassem dados de heatmap, validou `TRUST_PROXY` na inicialização em vez de travar, e corrigiu o tratamento de nomes de grupo do SCIM e de tempo limite do qpdf. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Transformou vários erros 500 em respostas 400 e 409 adequadas para ids de job malformados e importações multipart, e corrigiu a limpeza dos campos numéricos nas Configurações. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Fez a leitura de códigos de barras funcionar offline ao incluir o decodificador, corrigiu pré-visualizações de mídia que mostravam a entrada e melhorou a busca de formatos. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Relatou e corrigiu o Compress Video falhando em gravações de tela com taxa de quadros variável. (#2426, #2427)
- **@dvd233** ❤️: Expôs todos os formatos RAW de câmera que o decodificador suporta e fez as ferramentas de favicon aparecerem em buscas por ICO. (#1120, #1121)
- **@bercedev** ❤️: Corrigiu nomes de arquivo cujo radical repete a extensão e fez a IA informar o dispositivo em que realmente roda. (#3382, #3613)
- **@pamod-madubashana** ❤️: Traduziu o último título de MFA só em inglês e ligou strings de progresso não utilizadas. (#1228, #1227)
- **@mvanhorn** ❤️: Corrigiu a alocação duplicada de nomes de usuário no login SAML. (#2640)
- **@peremunoz** ❤️: Impediu que a geração de códigos de barras escondesse falhas de armazenamento e de memória como "Texto inválido". (#4057)
- **@mayuriphad** ❤️: Corrigiu uma falha com um cabeçalho de autenticação de alerta armazenado malformado. (#3080)
- **@DevShoaib78** ❤️: Corrigiu o fechamento do laço poligonal no editor. (#1207)
- **@dltsum** ❤️: Moveu as exibições de progresso para o catálogo de mensagens compartilhado. (#1262)
- **@albanobattistella** ❤️: Correções de tradução. (#1024)
- **@shoaibyazdani** ❤️: Regenerou as bases visuais do macOS. (#2475)

Divulgações de segurança:

- **@xaferima** ❤️: Descobriu que SVGs rejeitados pelo decodificador pulavam a sanitização e analisou o impacto conosco. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Descobriu que os links de resultado também serviam o upload original. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Descobriu que foto de passaporte e efeitos de fundo confiavam em um id de job fornecido pelo cliente. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: Descobriu que a importação por URL pulava as verificações de permissão. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: Relatou bypasses via IPv6 das verificações de endereço contra SSRF, com provas de conceito funcionais. As correções saíram na 2.0.0, e este agradecimento está atrasado. (#287)

Relatos de bugs:

- **@kabo** ❤️: O `docker-compose.yml` de exemplo não funcionava. (#1027)
- **@xromen** ❤️: PDFs danificados travando até o tempo limite de 30 segundos do qpdf. (#920)
- **@snmabaur** ❤️: O login OIDC definindo o nome de todo perfil como "admin". (#862)
- **@CodecNomad** ❤️: A ferramenta Blur duplicando a imagem. (#829)
- **@ohora0923** ❤️ e **@Alexis-VS-CSharp** ❤️: O Pixelate não funcionando. (#678, #775)
- **@mptpro** ❤️: O download de IA para remoção de fundo falhando. (#714)
- **@dominic427** ❤️: Redimensionar o canvas do editor escalava a imagem em vez de estendê-la. (#2016)
- **@CodeByToast** ❤️: Campos numéricos nas Configurações que não podiam ser apagados. (#1186)
- **@gioxx** ❤️: A verificação de disco do bundle de IA exigindo cerca de 18 GB para um bundle. (#1248)
- **@rekcodocker** ❤️ e **@madmike970** ❤️: Instalações de bundles de IA falhando no Proxmox LXC, com os detalhes do contêiner que ajudaram a identificar o problema. (#1030, #352)
- **@wxf26054** ❤️: Regras de senha desativadas ainda aplicadas ao criar usuários. (#1028)
- **@ersil** ❤️: O Safari do iOS requisitando o callback do OIDC duas vezes e caindo em uma página de erro depois de um login bem-sucedido. (#4021)
- **@casi-3** ❤️: A remoção de fundo em lote perdendo resultados concluídos quando o navegador reenviava a requisição, com um diagnóstico preciso. (#2015)
- **@killervette42** ❤️: A falha da GPU Blackwell no unRaid, que levou ao fallback para CPU das placas da série RTX 50. (#120, #4075)

Pedidos de recursos e feedback:

- **@photoevents** ❤️: Mediu que a remoção de fundo gastava cerca de 11 segundos carregando o modelo e 1 segundo inferindo, propôs fazer cache das sessões e compartilhou o que aprendeu ao rodar o próprio cache. Isso virou o cache de sessões desta versão. (#768, #776, #4144)
- **@benbou8231** ❤️: Apontou que os arquivos importados chegam em ordem invertida nas ferramentas de vários arquivos, o que levou à reordenação antes de uma execução. (#729, #756)
- **@cf3901646** ❤️: Rastreou um erro ruidoso de produção até a classe de erro 58 do Postgres e propôs a correção. Não pudemos mesclar o PR sem um CLA assinado, então escrevemos a mesma correção nós mesmos. (#4210, #4253)
- **@chiliec** ❤️: Notou que uma orientação automática com falha era engolida em silêncio e que o progresso de instalação ignorava o catálogo de traduções. As duas propostas chegaram por PRs dos mantenedores. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Propôs serializar a importação do módulo enterprise em uma única chamada, a correção para requisições SCIM concorrentes discordando sobre a licença. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Apontou que o guia de configuração nunca mencionava as substituições dos binários das engines nem `SNAPOTTER_HW_ACCEL`, que agora estão documentados. (#1312, #1696)
- **@aron-intframe** ❤️: Reproduziu uma lacuna no tratamento de erros do exiftool em um clone novo e descobriu que a condição de corrida no caminho temporário era pior do que a issue descrevia. (#3458)

Agradecemos também aos membros da comunidade que relataram estes problemas pelo Discord e por e-mail e cujos nomes não registramos.

[Diff completo no GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

A maior parte da 2.2 é endurecimento. Um não administrador com uma função `users:manage` delegada podia assumir o controle de uma instância, e todo endpoint de ferramenta estava sem a sua verificação de permissão. Atualize se você tem mais de um usuário.

O resto é a cauda longa do self-hosting: downloads que começavam e nunca terminavam, predefinições que quebravam assim que você adicionava um segundo arquivo, contêineres que entravam em loop de falhas enquanto o Postgres ainda subia. Duas ferramentas novas também chegaram. A documentação e o site agora estão traduzidos para 21 idiomas, e a interface finalmente atende ao contraste WCAG AA.

> [!IMPORTANT]
> Se você concedeu `users:manage` a um não administrador por meio de uma função personalizada, essa função podia assumir contas de administrador da 2.0.0 até a 2.1.0. Detalhes em Segurança.

### Segurança {#v2-2-0-security}

- **Escalonamento de privilégios por uma função `users:manage` delegada (GHSA-9xgh-95qh-2x7h).** Um não administrador com `users:manage` por meio de uma função personalizada podia redefinir a senha de uma conta de maior privilégio, ou excluí-la, inclusive a de um administrador embutido, e assumir o controle da instância. A redefinição de senha e a exclusão de conta agora verificam a autoridade de quem chama sobre o alvo, de modo que uma função delegada não alcança acima do seu próprio nível. Afetadas: 2.0.0 a 2.1.0. Relatado por 李春来 (Chunlai Li). (#616)
- **Todo endpoint de ferramenta agora é controlado.** O acesso às ferramentas era aplicado rota por rota, então todas as 45 rotas escritas à mão tinham que se lembrar da mesma chamada e nenhuma se lembrava. Uma função sem `tools:use` ainda podia executar image-to-pdf, erase-object, upscale, sign-pdf e o resto. A verificação agora fica em um único preHandler, baseado na rota correspondente, então cobre subcaminhos e qualquer rota adicionada depois. (#646)
- **O limite de taxa podia ser contornado em instalações Docker.** A imagem vinha com `TRUST_PROXY=true`, então o IP do cliente vinha de um cabeçalho da requisição e um `X-Forwarded-For` forjado passava pelo limitador de login. O padrão agora é uma lista de confiança de rede privada. (#649)
- **As gravações de configurações são verificadas por configuração**, e não uma vez só na entrada, e a importação de configuração agora é transacional, de modo que uma chave rejeitada não deixa metade de uma configuração aplicada. (#618)
- **Nomes de arquivos da biblioteca não conseguem escapar da raiz de armazenamento.** Um nome armazenado forjado, que uma importação SQLite 1.x maliciosa copia literalmente, podia ler ou excluir arquivos fora do diretório de arquivos. Só era alcançável depois de um operador importar um banco SQLite 1.x fornecido por um atacante, que é o único caminho que permite escolher um nome armazenado. Relatado por @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **O cancelamento de jobs verifica a propriedade**, então um usuário autenticado não pode mais cancelar o job de outro usuário pelo id. Relatado por @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Uma nova auditoria de toda a árvore 2.0 pegou o que ainda estava em aberto**: uma asserção SAML capturada podia ser reproduzida, um desafio de MFA sobrevivia a qualquer número de códigos errados, a consulta da chave de API a cada requisição era uma varredura completa da tabela, `MAX_WORKSPACE_SIZE_GB` era uma configuração morta, e o sanitizador de SVG deixava passar hrefs `javascript:` sem aspas. (#620)
- **Nove CVEs divulgados corrigidos**: fast-uri, svgo, sharp e tar de forma transitiva (#619), além do Pillow 12.3.0 (#517). A decodificação RAW em arm64 agora compila o LibRaw 0.22.2 a partir do código-fonte, em vez de vincular uma cópia do sistema sem correção. (#649)

### Novos recursos {#v2-2-0-new-features}

- **Rounded Crop**: máscaras de quadrado arredondado e squircle no estilo iOS, com controle do raio dos cantos. Feito para favicons e ícones de app. (#602)
- **Remove GIF Background**: remova o fundo de um GIF animado, WebP ou APNG quadro a quadro e receba de volta uma animação transparente. (#502)
- **Laço e modo Alta Qualidade no Object Eraser**: arraste um laço livre em vez de pintar cada pixel e, opcionalmente, instale um bundle de inpainting por difusão para preenchimentos mais limpos de áreas grandes. (#503, #566)
- **Salvar como novo ou sobrescrever.** Editar um arquivo da biblioteca substituía o original em silêncio. Agora você escolhe a cada edição, e o padrão o mantém. (#564, #577)
- **Predefinições de proporção no Resize.** Escolha 1:1, 4:3 ou 16:9 e as duas dimensões ficam travadas, sem ampliar. (#530)
- **OCR em duas camadas**: uma camada rápida vem embutida na imagem e roda offline, sem download, e um runtime mais preciso é instalado sob demanda. (#519)
- **Digite em qualquer lugar para buscar.** Comece a digitar no painel ou na página inicial e o texto cai na caixa de busca. (#644)
- **Documentação e site em 21 idiomas**: o site de documentação, as páginas de destino e a referência da API agora estão traduzidos, juntando-se à interface do app. Um novo guia de implantação com poucos recursos cobre Raspberry Pi e máquinas de 2 GB. (#548)
- **Nomes de ferramentas mais claros**: 18 nomes ambíguos agora se qualificam sozinhos, então "Compress" virou "Compress Image". Os ids e as rotas das ferramentas não mudaram, então nada que esteja nos favoritos quebra. (#520)

### Melhorias {#v2-2-0-improvements}

- **Contraste WCAG AA em toda a interface**: a paleta foi reajustada para que o laranja vivo fique nos preenchimentos enquanto textos e rótulos usam tokens de tinta acessíveis, e todos os 57 indicadores de foco agora atingem a exigência de 3:1 para elementos não textuais. (#567, #574)
- **Upscale e remoção de fundo deixam de parecer travados**: a barra de progresso avança durante a inferência em vez de parar em 30%, e as duas ferramentas agora avisam que um host apenas com CPU é muito mais lento. (#605, #608)
- **As mensagens de tempo limite apontam a causa real** e levam em conta hosts apenas com CPU, em vez de culpar o upload. (#596)
- **O SnapOtter espera o Postgres e o Redis na inicialização** em vez de entrar em loop de falhas, tanto no Compose quanto na imagem all-in-one. Uma instalação no Proxmox LXC reiniciava 76 vezes antes disso. (#537, #595)
- **Os downloads sobrevivem a um proxy reverso**: o SnapOtter pede ao nginx e a proxies compatíveis que não façam buffer das respostas de arquivo, que é o motivo habitual de um download self-hosted começar e nunca terminar. (#604, #607)
- **O Compress PDF chega perto do tamanho-alvo** e avisa com honestidade quando um alvo está fora de alcance. (#522)
- **Os controles das ferramentas no celular continuam acessíveis** agora que os layouts do app se ajustam à viewport dinâmica. (#559)
- **O Convert Audio expõe uma configuração de taxa de amostragem.** (#561)
- **Administradores podem relaxar o tamanho mínimo da senha**, até 1 para uma instância em LAN confiável. (#543)
- **A MFA é de autoatendimento**, o bloqueio por política foi eliminado, e logins OIDC ou SAML recebem um desafio de MFA de verdade em vez de um bloqueio total. (#531, #536)
- **Um `Error: Error` genérico agora aponta a causa.** Falhas de codificação do Sharp, encerramentos do sidecar de IA, saída do sidecar de documentos que não era JSON e falhas na remoção de fundo chegavam antes com o motivo apagado. (#532, #534, #535, #538, #612)
- **A caixa de diálogo de ajuda está traduzida.** Os rótulos de atalhos e o texto de primeiros passos estavam fixos em inglês enquanto traduções prontas ficavam sem uso nos 21 arquivos de idioma. (#647)

### Correção de bugs {#v2-2-0-bug-fixes}

- **Arquivos HEIC de iPhone eram rejeitados** como ilegíveis antes de chegarem ao decodificador que os trata. (#631)
- **As predefinições de conversão falhavam com um segundo arquivo**: jpg-to-pdf e suas irmãs image-to-pdf, além de pdf-to-png, pdf-to-jpg e pdf-to-tiff, retornavam `Tool not found` quando você enviava dois arquivos. (#633, #643)
- **As predefinições de conversão de PDF perdiam o botão de download.** (#629)
- **Um tempo limite de processamento ilimitado não era respeitado**, e os streams de progresso travados agora se recuperam em vez de deixar a interface esperando. (#638)
- **Os downloads travavam em vez de falhar** quando um arquivo armazenado era mais curto que o tamanho registrado. (#617)
- **As ferramentas de página de PDF falhavam em arquivos curtos e criptografados**: o Remove Pages usava por padrão um intervalo de páginas que nenhum documento com menos de seis páginas tem, e PDFs protegidos por senha falhavam de forma enigmática dentro do worker. (#594)
- **O PDF to Text devolvia em silêncio um arquivo vazio** para PDFs escaneados. Agora ele indica o OCR e serve o texto em UTF-8. (#603)
- **O PDF to Word descartava blocos de texto coloridos** e os dividia pela página. (#500)
- **O Object Eraser deixava resquícios fantasmas** e borrava objetos pequenos em imagens de alta resolução. (#501)
- **O Stabilize Video gravava uma saída que não podia ser reproduzida** sem faststart. (#593)
- **Reparos no editor de imagens**: girar, espelhar, redimensionar, níveis, curvas, filtros e bloqueio de camadas. (#597)
- **O Sign PDF mostrava um canvas em branco** em vez de informar por que um PDF falhou ao carregar. (#545)
- **A biblioteca de arquivos registrava dimensões 0x0** e pulava as pré-visualizações de uploads HEIC, RAW e PSD. (#636, #637)
- **Instalar mais de um bundle de IA** deixava o virtualenv compartilhado com várias versões e quebrava três ferramentas em silêncio. (#649)
- **Converter para JXL com qualidade de 1 a 4 retornava um 500**, e a falta do ffmpeg era informada a você como um upload corrompido. (#649)
- **Uma queda transitória do Postgres deixava jobs concluídos abandonados**, com a saída em disco e nenhuma linha apontando para ela. Um reconciliador agora adota esse trabalho em vez de descartá-lo. (#649)
- **Um endpoint do Redis que mudou de endereço travava todos os consumidores** enquanto os health checks ainda respondiam 200. (#649)
- **Correções no site e na documentação**: os links localizados não perdem mais os fragmentos `#` nem passam `zh-CN` para minúsculas, a navegação da documentação fica dentro da viewport em tablets, e nenhum dos sites chama mais a API do GitHub a partir do seu navegador. (#516, #562, #570, #560)

### Notas de atualização {#v2-2-0-upgrade-notes}

Nada a migrar, mas dois padrões fornecidos mudaram:

- **`TRUST_PROXY` agora tem como padrão `loopback,linklocal,uniquelocal`** em vez de confiar em todos os peers. As redes bridge e Compose do Docker ficam dentro desse intervalo, então a maioria das configurações não precisa de mudança. Se o seu proxy reverso alcança o SnapOtter a partir de um endereço público, defina `TRUST_PROXY` explicitamente, ou o limite de taxa e os logs de auditoria atribuirão todas as requisições ao proxy.
- **`MAX_AI_JOBS_PER_USER` tem como padrão 5** jobs de IA de arquivo único em andamento por usuário. As execuções de IA em lote e de pipeline continuam sem limite.

Novos ajustes opcionais: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (desativado por padrão) e `GIF_BG_MAX_FRAMES`.

### Agradecimentos {#v2-2-0-acknowledgements}

Boa parte desta versão começou como o relato de bug de outra pessoa.

Código e contribuições:

- **@mvanhorn** ❤️: Reescreveu a falha de tempo limite da remoção de fundo em uma mensagem que diz o que fazer a respeito, em vez de um tempo limite genérico. (#518, #494)
- **@EuanTop** ❤️: Restaurou a ação de download nas páginas de predefinição de conversão de PDF ao fazer a rota síncrona retornar o contrato padrão de resultado de ferramenta. (#629, #623)
- **@harshjainnn** ❤️: Diagnosticou o download que começa e nunca termina e propôs a direção de reset de socket na qual a correção foi construída. (#617, #590)

Divulgações de segurança:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Divulgou em particular o escalonamento de privilégios por uma função `users:manage` delegada, com uma análise completa da origem ao destino e uma cadeia de exploração funcional. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Divulgou um IDOR autenticado no cancelamento de jobs e um path traversal nos nomes de arquivo armazenados da biblioteca, alcançável após uma importação SQLite 1.x maliciosa, com uma prova de conceito funcional para cada um. (#599, #600)

Relatos de bugs:

- **@riz467** ❤️: Arquivos HEIC reais de iPhone rejeitados na validação, com a causa raiz levantada no próprio relato. (#622)
- **@coupej** ❤️: Páginas de predefinição de PDF travadas para sempre e o jpg-to-pdf falhando assim que um segundo arquivo era adicionado. Dois bugs distintos, separados corretamente. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` documentado como ilimitado mas limitado a cinco minutos. (#630)
- **@bezibaerchen** ❤️: O Convert Audio escondia a configuração de taxa de amostragem que a própria descrição prometia. (#558)
- **@hell-toupee** ❤️: O bundle de OCR preciso falhando ao instalar com um erro `libpaddle`. (#505)
- **@Michael1260** ❤️ e **@And-CSH** ❤️: Confirmaram de forma independente essa falha de instalação do OCR e estabeleceram que a extração manual funciona enquanto o instalador do app não, o que localizou o bug no instalador. (#505)
- **@TomErnst1972** ❤️: Ativar a política de MFA obrigatória bloqueando um administrador fora da própria instância. (#515)
- **@thokich** ❤️: A remoção de objetos produzindo preenchimentos borrados e inutilizáveis, o que motivou tanto a reescrita do inpainting em HD quanto o bundle opcional de alta qualidade. (#141)
- **@Hennie-git** ❤️: Uma instalação no Proxmox LXC reiniciando 76 vezes contra um Postgres que ainda não aceitava conexões. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Fez a triagem desse relato em tempo real e produziu o diagnóstico em que a correção de inicialização foi construída. (#537)

Pedidos de recursos e feedback:

- **@LECOQQ** ❤️: Pediu para relaxar a complexidade da senha em uma instalação de servidor doméstico. (#136)
- **@killervette42** ❤️: Pediu um Community App do Unraid, agora publicado na loja CA do Unraid. (#96)
- **@alienatedsec** ❤️: Apontou que a correção do fallback da GPU para a CPU estava enterrada em uma issue fechada e era impossível de encontrar, e por isso ela agora está na documentação de implantação. (#490, #587)
- **@neilp316** ❤️: Confirmou a falha da GPU Blackwell em uma RTX 5060 e mapeou um caminho de atualização para o CUDA 12.8 que funciona. (#120)
- **@Roiki11** ❤️: Defendeu armazenamento compartilhado com referências de caminho em vez de transferência de arquivos por HTTP para computação de IA fora da máquina. (#189)

Agradecemos também aos membros da comunidade que relataram estes problemas pelo Discord e por e-mail e cujos nomes não registramos: o pedido do recorte squircle (#602), o download de image-to-PDF que começava e nunca terminava (#604, #607), a ferramenta Delete Pages travando (#594), o texto em árabe ausente no pdf-to-text (#603) e o diagnóstico por trás do fallback de GPU do ONNX (#490).

[Diff completo no GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

O SnapOtter 2.0 transforma o kit de ferramentas de imagem em uma suíte completa de manipulação de arquivos: mais de 200 ferramentas em cinco modalidades (Imagem, Vídeo, Áudio, PDF e Arquivos), reconstruída sobre Postgres 17 e uma fila de jobs baseada em Redis, com um `docker run` de um único comando. Esta é uma versão principal; leia as Mudanças incompatíveis antes de atualizar da 1.x.

### Novos recursos {#new-features}

- **Quatro novas modalidades de ferramentas**: Vídeo, Áudio, PDF e Arquivos se juntam a Imagem, levando o catálogo a mais de 200 ferramentas.
- **Jobs em segundo plano duráveis**: Uma fila baseada em Redis (BullMQ) executa cada ferramenta como um job rastreado, com progresso ao vivo por SSE.
- **Modo all-in-one de contêiner único**: Um único `docker run` sobe uma instância completa com Postgres e Redis embutidos.
- **Bundles de IA sob demanda**: Remoção de fundo, OCR, transcrição, upscale, detecção e aprimoramento de rostos, object eraser, colorização e restauração de fotos são instalados pela interface. A aceleração por GPU é detectada por framework.
- **Sign PDF**: Desenhe, digite ou envie uma assinatura e posicione-a em um PDF no navegador.
- **Automate**: Um construtor visual de pipelines que encadeia ferramentas, com nove modelos prontos.
- **83 predefinições de conversão com um clique**: Conversores dedicados como JPG para PNG e MP4 para GIF, com busca aproximada.
- **Editor de imagens baseado em camadas**: Um editor com Konva em `/editor`, com pincéis, formas, ajustes, filtros e curvas.
- **Biblioteca de arquivos**: Salve qualquer resultado e reutilize-o como entrada de outra ferramenta.
- Ferramentas fixadas, zoom e panorâmica no canvas, 21 idiomas e recursos enterprise (OIDC/SSO, SAML, SCIM, armazenamento S3, permissões por ferramenta, exportação de auditoria, tracing distribuído).

### Melhorias {#improvements}

- Cancele um processo em execução. (#137)
- Decodificação RAW em resolução total pelo LibRaw, incluindo DNG. (#289)
- Implantações sem root e com UID externo (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Detecção precisa de instalação de IA e um fluxo de instalação reforçado. (#214, #352)
- Reforço de privacidade: nenhuma saída automática para terceiros, além de um modo estritamente offline opcional.
- Botão de feedback sempre ativo, mesmo com as análises desativadas.

### Correção de bugs {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` volta a desativar o limite de taxa nas rotas de ferramentas. (#271)
- Caminhos do virtualenv de IA reparados dentro da imagem Docker. (#390)
- Compatibilidade com sharp 0.35.2+. (#362)
- Correções de layout do editor de imagens: réguas, comportamento de preenchimento, barra lateral e dimensionamento do canvas. (#258, #259)
- Tradução para italiano concluída. (#231, #206, #425)
- Audio normalize e loudnorm preservam a taxa de amostragem de origem.
- Reforço contra SSRF: correspondência numérica de CIDR IPv6 e uma pré-varredura de URL ampliada. (#287)
- Os PDFs gerados são marcados com SnapOtter como Producer.
- O mediapipe é instalado no Python 3.13 e no Debian 13.

### Mudanças incompatíveis {#breaking-changes}

A 2.0 substitui o banco de dados SQLite embutido pelo Postgres 17 e adiciona o Redis 8 para a fila de jobs. Seus dados da 1.x migram automaticamente no primeiro boot, mas a stack de contêineres mudou, então faça backup de todo o seu volume `/data` primeiro (a 1.x roda o SQLite em modo WAL, então os dados confirmados costumam ficar em `snapotter.db-wal`). Depois escolha a imagem de contêiner único (Postgres e Redis embutidos, somente root) ou a stack Compose (app mais Postgres 17 e Redis 8). Veja o [guia de migração](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) e o [guia de atualização](/pt-BR/guide/upgrading).

### Atualização {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Ou com Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo no GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nova ferramenta HTML to Image, acessibilidade WCAG 2.2 AA, reforço de segurança a partir de testes de intrusão e 5 correções críticas do Docker.

### Novos recursos {#new-features-1}

- **HTML to Image**: Capture screenshots de URLs ou de HTML bruto como PNG/JPEG/WebP. Capturas de página inteira, viewports personalizadas, modo escuro.
- **Convenção _FILE de segredos do Docker**: Monte variáveis de ambiente sensíveis como arquivos em vez de texto simples. (#205)
- **Licenciamento enterprise e armazenamento S3**: Chave de licença comercial opcional e armazenamento de objetos compatível com S3.
- **Melhorias no editor de formas**: Transparência de preenchimento/traço, seletor de cor RGBA, estilos de linha tracejada.
- **Arquivos de versão pré-compilados**: Baixe tarballs das GitHub Releases para instalações sem Docker (Proxmox, bare metal, LXC). (#202)

### Melhorias {#improvements-1}

- **Acessibilidade WCAG 2.2 AA**: Pular navegação, aprisionamento de foco, regiões aria-live, suporte a movimento reduzido, proporções de contraste corretas. (#209)
- **Responsividade para celular**: Configurações responsivas, reconexão automática do SSE ao trocar de aba no celular. (#203, #204)
- **Qualidade da remoção de fundo**: Suavização de bordas, descontaminação de cor, seleção do formato de saída.
- **Tradução para italiano**: ~145 novas strings por @albanobattistella. (#206)
- **Documentação da API por ferramenta**: 53 páginas de documentação com parâmetros, exemplos e formatos de resposta.
- **Downloads de modelos de IA**: Lógica de nova tentativa com backoff exponencial para o HuggingFace. (#201)

### Correção de bugs {#bug-fixes-1}

- Contêineres Docker novos ficavam completamente inutilizáveis (o limite de taxa bloqueava todas as requisições).
- As ferramentas de IA de detecção de rostos (blur-faces, red-eye-removal, enhance-faces, passport-photo) falhavam em todas as plataformas.
- Arquivos HEIC quebrados em ARM (incompatibilidade de símbolos do libheif).
- Os bundles de IA de upscale e restore-photo falhavam ao instalar em ARM.
- O OCR usava a versão errada do CUDA em contêineres com GPU.
- Bypass da proteção contra SSRF por endereços IPv6 mapeados de IPv4 em hexadecimal. (Crédito: @tonghuaroot)
- Decodificação de HEIC de iPhone com imagens auxiliares. (#183, #199)
- OOM do CUDA no Real-ESRGAN em GPUs de 8 GB. (#200)
- 6 erros de produção do Sentry e 7 bugs de QA. (#208)

### Segurança {#security}

- 10 achados do teste de intrusão corrigidos (bypass de XFF, falhas com JSON malformado, pipelines sem limite, XSS no log de auditoria, método TRACE e mais). (#207)
- Bypass de SSRF via IPv6 em hexadecimal bloqueado. (Crédito: @tonghuaroot)
- Imagens base do Dockerfile fixadas por digest.

### Atualização {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Ou com Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo no GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Demo ao vivo, páginas de destino por ferramenta e um lote de correções de acabamento.

### Novos recursos {#new-features-2}

- **Demo ao vivo** - [demo.snapotter.com](https://demo.snapotter.com) permite que as pessoas experimentem o SnapOtter sem instalar nada.
- **Página de índice de ferramentas** - Navegue por todas as mais de 50 ferramentas em `/tools` com busca e filtros de categoria.
- **Mais de 50 páginas de destino para SEO** - Cada ferramenta agora tem uma página de destino própria, com FAQs, casos de uso e tabelas de comparação.
- **Pré-visualização de fundo** - O slider de antes e depois mostra um fundo xadrez atrás de imagens transparentes.
- **Gerador de senhas fortes** - Botão de um clique no formulário Adicionar membros.

### Correção de bugs {#bug-fixes-2}

- A ferramenta de informações de HEIC/HEIF não falha mais (pré-decodificação adicionada).
- A instalação de bundles de modelos de IA mostra mensagens de erro melhores e respeita os limites de recursos.
- As miniaturas da biblioteca carregam corretamente (faltavam cabeçalhos de autenticação).
- Os menus suspensos não são mais cortados nas tabelas de configurações de Pessoas e Equipes.
- A porcentagem de comparação de tamanho fica oculta nas ferramentas que não comprimem.
- Link duplicado da política de privacidade removido.
- Tradução para italiano adicionada às configurações de recursos de IA.
- Ícones do Lucide que foram renomeados foram atualizados (Wand2, Columns).

### Infraestrutura {#infrastructure}

- OpenSSF Scorecard reforçado de 4,3 para ~7,0.
- Testes de CI paralelizados em 4 shards com fixtures reduzidas.
- 41 atualizações de dependências.

### Atualização {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Ou com Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo no GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Cinco novas ferramentas, um editor de imagens completo, login com SSO, 20 idiomas. Provavelmente deveriam ter sido três versões separadas, mas aqui estamos.

### Novos recursos {#new-features-3}

- **Editor de imagens** - Camadas, pincéis, formas, ajustes, filtros, curvas, atalhos de teclado. Roda no seu navegador, processa no seu hardware.
- **Autenticação OIDC / SSO** - Entre com Google, GitHub, Okta ou qualquer provedor OpenID Connect. Defina algumas variáveis de ambiente e sua equipe usa as contas que já tem.
- **Gerador de memes** - 100 modelos embutidos com renderização de texto via opentype.js. Ou envie sua própria imagem.
- **Beautify** - Jogue um screenshot e receba uma imagem polida. Molduras de dispositivos (macOS, Windows, navegador), sombras, gradientes, predefinições para redes sociais.
- **Simulação de daltonismo** - Veja como as imagens aparecem com protanopia, deuteranopia, tritanopia e outras deficiências de visão de cores.
- **Corretor de transparência de PNG** - Detecta PNGs com falsa transparência e os corrige com BiRefNet HR-matting. Remoção opcional de marca d'água via inpainting com LaMa.
- **Expansão de canvas com IA** - Estenda os limites da imagem com preenchimento por IA. Três níveis de qualidade (rápido, equilibrado, qualidade), conforme quanto tempo de GPU você quer gastar.
- **20 idiomas** - Árabe, chinês (simplificado/tradicional), tcheco, holandês, francês, alemão, hindi, indonésio, italiano, japonês, coreano, polonês, português, russo, espanhol, tailandês, turco, ucraniano, vietnamita. RTL funciona para o árabe.
- **Importação por URL** - Cole URLs na área de soltar ou importe em massa a partir de uma lista. Busca no servidor com proteção contra SSRF.
- **Eraser com vários arquivos** - Desenhe máscaras de apagamento em várias imagens e processe todas com um clique. Os traços persistem por imagem.
- **Importação/exportação de pipelines** - Salve cadeias de ferramentas como JSON e compartilhe com outras pessoas.
- **17 novos formatos RAW de câmera** via exiftool, além de entrada de QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ e APNG. Novos codecs de saída para BMP, ICO, JP2, QOI. A exportação para AVIF, TIFF, GIF, JXL e PSD foi recuperada de um branch perdido anteriormente.

### Melhorias {#improvements-2}

- **Aprimoramento de imagem** - Substituiu o pipeline antigo por CLAHE + normalização + gama. O novo botão Deep Enhance usa o modelo de IA para resultados mais agressivos.
- **Restore photo** - Detecção de arranhões reescrita com filtragem de Otsu em 8 ângulos. O inpainting com LaMa agora roda na resolução nativa.
- **Formatos exóticos em todo lugar** - OCR, image-to-PDF, gerador de favicon, composição, stitch e vectorize agora decodificam HEIC, RAW e PSD.
- **Compress** - Tolerância do tamanho-alvo reduzida de 5% para 1%. O tamanho-alvo é o modo padrão. Adicionados botões de incremento e seletor de unidade KB/MB.
- **Limpeza do Sentry** - 644 eventos sem ação filtrados. Os erros reais agora são tratados corretamente.
- **Detecção de GPU** - Melhor diagnóstico para contêineres em que o CUDA existe mas o nvidia-smi não.
- **Modo sem autenticação** - O usuário anônimo é semeado no banco com a função de administrador. Chaves de API, pipelines e arquivos do usuário não quebram mais por restrições de FK.
- **Mais de 2.705 novos testes** entre unitários, de integração e E2E.

### Correção de bugs {#bug-fixes-3}

- O upscale na CPU não estoura mais o tempo em NAS e hardware de baixo consumo.
- O logo do código QR não faz mais a pré-visualização sumir permanentemente.
- Estouro no recorte corrigido para imagens retrato altas.
- Arquivos TIFF com alfa agora forçam corretamente a saída PNG em vez de produzir corrupção.
- A decodificação de HDR/EXR converte para 8 bits antes do CLAHE, corrigindo falhas de decodificação.
- Os buffers de entrada de pontos de referência faciais são convertidos para PNG antes do sidecar Python, corrigindo falhas.
- O Find duplicates lida com lotes de formatos mistos e erros de rede.
- A pré-visualização do Beautify atualiza em tempo real.
- Barras de progresso para stitch e vectorize.
- SVGZ tratado pelo SVG-to-raster.
- Nomes de arquivo não ASCII corrigidos por meio do cabeçalho X-File-Results com codificação percentual.

### Atualização {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Ou com Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo no GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Imagem Docker unificada com detecção automática de GPU. Uma única imagem atende cargas de CPU e de GPU. Compose simplificado em um único arquivo com rotação de logs. Os pré-downloads de modelos agora incluem verificação e um smoke test.

---

## v1.13.0 {#v1-13-0}

Controle de acesso baseado em funções (RBAC). 14 permissões granulares, três funções embutidas (admin, editor, user), suporte a funções personalizadas. Verificações de permissão em todas as rotas da API. Abas do frontend filtradas pelas permissões do usuário.

---

## v1.12.0 {#v1-12-0}

Ferramenta PDF to Image. Converta páginas de PDF em PNG, JPEG, WebP ou TIFF com DPI personalizado. Imagem Docker unificada com detecção automática de GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt gerado automaticamente via vitepress-plugin-llms para uma documentação amigável a IA.

---

## v1.10.0 {#v1-10-0}

Redimensionamento com reconhecimento de conteúdo (seam carving) com proteção de rostos. Redimensione imagens preservando o conteúdo importante.

---

## v1.9.0 {#v1-9-0}

Ferramenta Stitch / Combine. Junte imagens lado a lado, empilhadas na vertical ou em uma grade personalizada.

---

## v1.8.0 {#v1-8-0}

Ferramenta Edit Metadata. Visualize e edite metadados EXIF, IPTC e XMP com uma interface granular de remover/manter.

---

## Versões anteriores {#older-releases}

Para o changelog completo no nível de commits, incluindo as versões de correção, veja as [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
