---
description: "Instale o SnapOtter com Docker em um único comando. Inclui configuração de Docker Compose, build a partir do código-fonte e uma visão geral completa das features."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: c4412ce7358f
i18n_hash_version: 2
---

# Primeiros Passos {#getting-started}

::: tip Experimente antes de instalar
Explore a interface completa em [demo.snapotter.com](https://demo.snapotter.com) - sem cadastro ou instalação necessários.
:::

## Início Rápido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Este contêiner único executa tudo o que precisa: sem nenhum conjunto `DATABASE_URL`, ele inicia seu próprio PostgreSQL e Redis na interface de loopback (modo incorporado) e mantém todos os dados no volume `SnapOtter-data`. É a maneira mais rápida de experimentar o SnapOtter ou auto-hospedar em um homelab. Para produção, use a [pilha canônica do Docker Compose](#docker-compose), que mantém PostgreSQL e Redis em seus próprios contêineres. O modo incorporado é executado como root (o padrão) e é desativado automaticamente assim que você define `DATABASE_URL`.

Vai instalar em um Raspberry Pi, um notebook antigo ou um VPS pequeno? Veja [Ambientes com Poucos Recursos](/pt-BR/guide/low-resource) para um passo a passo ajustado e o que esperar de hardware limitado.

Você será solicitado a trocar sua senha no primeiro login.

::: tip Analytics Anônimos de Produto
O SnapOtter inclui analytics de produto anônimos por padrão. Para desativá-los, abra **Configurações → Sistema → Privacidade** e desligue **Analytics Anônimos de Produto**. Eles param imediatamente para toda a instância.

Você também pode definir a variável de ambiente `SNAPOTTER_TELEMETRY=0` (`false` e `off` também funcionam) para desabilitar toda a telemetria da instância sem um rebuild.

O monitoramento de erros é fornecido pelo [Sentry](https://sentry.io), que patrocina o SnapOtter através do seu programa open-source.

Para detalhes sobre o que é coletado, veja [O que o SnapOtter coleta](/pt-BR/guide/telemetry).
:::

::: tip Aceleração NVIDIA CUDA
Adicione `--gpus all` para remoção de fundo, aumento de escala, aprimoramento de rosto e restauração acelerados por NVIDIA CUDA. OCR permanece baseado em CPU e funciona na mesma imagem com ou sem acesso GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Requer o [kit de ferramentas NVIDIA Container](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Volta para a CPU automaticamente quando CUDA não está disponível. A aceleração Intel/AMD iGPU por meio de VA-API, Quick Sync ou OpenCL não é suportada atualmente para inferência de IA. Consulte [Tags Docker](/pt-BR/guide/docker-tags) para benchmarks. Se as ferramentas de IA forem executadas na CPU apesar de `--gpus all`, consulte [Verificar aceleração de GPU](/pt-BR/guide/deployment#verify-gpu-acceleration).
:::

::: details Também no GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Ambos os registries publicam a mesma imagem a cada release.
:::

## Docker Compose {#docker-compose}

Use o arquivo de produção mantido e testado com cada versão em vez de copiar um exemplo abreviado do Compose desta página:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

O [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) canônico inclui todos os quatro volumes de tempo de execução, verificações de integridade, limites de recursos, configuração durável do Redis, imagens de banco de dados/cache fixadas e a proteção atual do contêiner. Altere a senha de administrador padrão imediatamente após o primeiro login. Para uma implantação reproduzível, fixe a imagem do aplicativo SnapOtter na tag de lançamento ou resumo que você verificou em vez de seguir `latest`.

Consulte [Configuração](/pt-BR/guide/configuration) para todas as variáveis ​​de ambiente e [Segurança e proteção](/pt-BR/guide/security) para segredos, política de rede e orientação de backup.

## Build a partir do Código-Fonte {#build-from-source}

**Pré-requisitos:** Node.js 22.22+, pnpm 9+, Docker (para Postgres + Redis), Python 3.11+ (para features de IA), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## O Que Você Pode Fazer {#what-you-can-do}

### Processamento de Arquivos (200+ Ferramentas) {#file-processing-200-tools}

| Modalidade | Contagem | Ferramentas de Exemplo |
|----------|-------|---------------|
| **Imagem** | 107 | Redimensionar, Recortar, Comprimir, Converter, Remover Fundo, Upscale, OCR, Marca d'água, Colagem, Colorizar, Ferramentas de GIF, presets de formato |
| **Vídeo** | 57 | Cortar, Recortar, Comprimir, Converter, Mesclar, Extrair Áudio, Legendas Automáticas, Vídeo para GIF, Redimensionar, Estabilizar, presets de formato |
| **Áudio** | 27 | Cortar, Mesclar, Converter, Normalizar, Redução de Ruído, Transcrever, Alteração de Pitch, Fade, Criador de Toques, presets de formato |
| **PDF / Documento** | 29 | Mesclar, Dividir, Comprimir, OCR, Marca d'água, Ocultar, Word para PDF, Excel para PDF, Girar, Proteger, Reparar |
| **Arquivos** | 23 | CSV para JSON, JSON para XML, Mesclar CSVs, Dividir CSV, Criar ZIP, Extrair ZIP, Criador de Gráficos, YAML/JSON |

### Pipelines {#pipelines}

Encadeie ferramentas em fluxos de trabalho de múltiplas etapas e aplique-os a uma imagem ou a um lote inteiro:

1. Abra **Pipelines** na barra lateral.
2. Adicione etapas (qualquer ferramenta, quaisquer configurações).
3. Rode em um único arquivo - ou em um lote inteiro de uma vez.
4. Salve o pipeline para reutilização posterior.

Os pipelines permitem 20 etapas por padrão. Defina `MAX_PIPELINE_STEPS=0` para tornar o limite ilimitado.

### Biblioteca de Arquivos {#file-library}

Cada arquivo que você processa pode ser salvo na sua biblioteca de **Arquivos**. O SnapOtter rastreia todo o histórico de versões para que você possa acompanhar cada etapa de processamento do upload original até a saída final.

Salvar é explícito: resultados que você salva na biblioteca são mantidos até você excluí-los, enquanto resultados que você processa e deixa sem salvar são limpos automaticamente após 72 horas (configurável via `FILE_MAX_AGE_HOURS`).

### API REST e Chaves de API {#rest-api-api-keys}

Toda ferramenta é acessível via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Gere chaves de API em **Configurações → Chaves de API**. Veja a [referência da API REST](/pt-BR/api/rest) para todos os endpoints, ou acesse [http://localhost:1349/api/docs](http://localhost:1349/api/docs) para a referência interativa.

### Multiusuário e Equipes {#multi-user-teams}

Habilite múltiplos usuários com controle de acesso baseado em papéis:

- **Admin**: acesso completo - gerenciar usuários, equipes, configurações, todos os arquivos/pipelines/chaves de API
- **Usuário**: usar ferramentas, gerenciar os próprios arquivos/pipelines/chaves de API

Crie equipes em **Configurações → Equipes** para agrupar usuários.

Defina `AUTH_ENABLED=true` (ou `false` para usuário único/uso próprio sem login).

## Use no celular {#use-it-from-your-phone}

O SnapOtter funciona em navegadores móveis e pode ser instalado como aplicativo. Abra sua instância no celular e depois:

- **iPhone / iPad (Safari):** toque em Compartilhar e depois em **Adicionar à Tela de Início**.
- **Android (Chrome):** abra o menu do navegador e toque em **Instalar app**.

O aplicativo instalado abre em uma janela própria, direto na sua instância.

Um detalhe: os navegadores só oferecem a instalação via HTTPS. Um endereço HTTP simples na sua rede local continua funcionando normalmente em uma aba do navegador; para a instalação de verdade, coloque a instância atrás de um proxy reverso com certificado (veja o [guia de implantação](/pt-BR/guide/deployment)).

Em celulares e tablets, as ferramentas de imagem mostram um botão **Tirar foto** ao lado do botão de envio. Fotografe um recibo ou um quadro branco e a imagem cai direto na ferramenta.
