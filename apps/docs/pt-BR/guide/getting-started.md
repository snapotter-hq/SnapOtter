---
description: "Instale o SnapOtter com Docker em um único comando. Inclui a configuração do Docker Compose, compilação a partir do código-fonte e uma visão geral completa dos recursos."
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: b991550a75a6
i18n_hash_version: 2
---

# Primeiros passos {#getting-started}

::: tip Experimente antes de instalar
Explore a interface completa em [demo.snapotter.com](https://demo.snapotter.com), sem cadastro nem instalação.
:::

## Início rápido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Este único contêiner executa tudo de que precisa: sem `DATABASE_URL` definido, ele inicia o próprio PostgreSQL e o próprio Redis na interface de loopback (modo embutido) e mantém todos os dados no volume `SnapOtter-data`. É a forma mais rápida de experimentar o SnapOtter ou de hospedá-lo em um homelab. Para produção, use a [stack Docker Compose canônica](#docker-compose), que mantém o PostgreSQL e o Redis em seus próprios contêineres. O modo embutido roda como root (o padrão) e é desativado automaticamente assim que você define `DATABASE_URL`.

Vai instalar em um Raspberry Pi, um notebook antigo ou uma VPS pequena? Consulte [Configurações de poucos recursos](/pt-BR/guide/low-resource) para um passo a passo ajustado e o que esperar de um hardware limitado.

Será solicitado que você altere a senha no primeiro login.

::: tip Anonymous Product Analytics
O SnapOtter inclui analytics de produto anônimos por padrão. Para desativá-los, abra **Configurações → Sistema → Privacidade** e desative **Anonymous Product Analytics**. Ele para imediatamente para toda a instância.

Você também pode definir a variável de ambiente `SNAPOTTER_TELEMETRY=0` (`false` e `off` também funcionam) para desativar toda a telemetria da instância sem precisar recompilar.

O monitoramento de erros é feito pelo [Sentry](https://sentry.io), que patrocina o SnapOtter por meio do seu programa de código aberto.

Para detalhes sobre o que é coletado, consulte [O que o SnapOtter coleta](/pt-BR/guide/telemetry).
:::

::: tip Aceleração NVIDIA CUDA
Adicione `--gpus all` para remoção de fundo, ampliação, aprimoramento de rostos e restauração acelerados por NVIDIA CUDA. O OCR continua baseado em CPU e funciona na mesma imagem com ou sem acesso à GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Requer o [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Recorre à CPU automaticamente quando o CUDA não está disponível. A aceleração por iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL não é compatível com inferência de IA atualmente. Consulte [Tags Docker](/pt-BR/guide/docker-tags) para benchmarks. Se as ferramentas de IA rodarem na CPU apesar de `--gpus all`, consulte [Verifique a aceleração por GPU](/pt-BR/guide/deployment#verify-gpu-acceleration).
:::

::: details Também no GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Os dois registries publicam a mesma imagem a cada lançamento.
:::

## Docker Compose {#docker-compose}

Use o arquivo de produção mantido e testado a cada lançamento, em vez de copiar um exemplo de Compose resumido desta página:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

O [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) canônico inclui os quatro volumes de runtime, verificações de integridade, limites de recursos, configuração durável do Redis, imagens de banco de dados/cache fixadas e o endurecimento atual do contêiner. Altere a senha padrão do administrador imediatamente após o primeiro login. Para uma implantação reproduzível, fixe a imagem do aplicativo SnapOtter na tag de release ou no digest que você verificou, em vez de seguir `latest`.

Consulte [Configuração](/pt-BR/guide/configuration) para todas as variáveis de ambiente e [Segurança e hardening](/pt-BR/guide/security) para segredos, política de rede e orientações de backup.

## Compilar a partir do código-fonte {#build-from-source}

**Pré-requisitos:** Node.js 22.22+, pnpm 9+, Docker (para Postgres + Redis), Python 3.11+ (para recursos de IA), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## O que você pode fazer {#what-you-can-do}

### Processamento de arquivos (mais de 200 ferramentas) {#file-processing-200-tools}

| Modalidade | Quantidade | Exemplos de ferramentas |
|----------|-------|---------------|
| **Imagem** | 112 | Redimensionar, Cortar, Comprimir, Converter, Remover fundo, Ampliar, OCR, Marca d'água, Colagem, Colorizar, Ferramentas de GIF, predefinições de formato |
| **Vídeo** | 57 | Aparar, Cortar, Comprimir, Converter, Mesclar, Extrair áudio, Legendas automáticas, Vídeo para GIF, Redimensionar, Estabilizar, predefinições de formato |
| **Áudio** | 27 | Aparar, Mesclar, Converter, Normalizar, Redução de ruído, Transcrever, Alterar tom, Fade, Criador de toques, predefinições de formato |
| **PDF / Documento** | 35 | Mesclar, Dividir, Comprimir, OCR, Marca d'água, Redigir, Word para PDF, Excel para PDF, Girar, Proteger, Reparar |
| **Arquivos** | 23 | CSV para JSON, JSON para XML, Mesclar CSVs, Dividir CSV, Criar ZIP, Extrair ZIP, Criador de gráficos, YAML/JSON |

### Pipelines {#pipelines}

Encadeie ferramentas em fluxos de trabalho de várias etapas e aplique-os a uma imagem ou a um lote inteiro:

1. Abra **Pipelines** na barra lateral.
2. Adicione etapas (qualquer ferramenta, com qualquer configuração).
3. Execute em um único arquivo ou em um lote inteiro de uma vez.
4. Salve o pipeline para reutilizá-lo depois.

Os pipelines permitem 20 etapas por padrão. Defina `MAX_PIPELINE_STEPS=0` para tornar o limite ilimitado.

### Biblioteca de arquivos {#file-library}

Todo arquivo que você processa pode ser salvo na sua biblioteca de **Arquivos**. O SnapOtter registra o histórico completo de versões, para que você possa rastrear cada etapa de processamento, do upload original até a saída final.

O salvamento é explícito: os resultados que você salva na biblioteca são mantidos até você excluí-los, enquanto os resultados que você processa e deixa sem salvar são apagados automaticamente após 72 horas (configurável por meio de `FILE_MAX_AGE_HOURS`).

### API REST e chaves de API {#rest-api-api-keys}

Toda ferramenta é acessível via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Gere chaves de API em **Configurações → Chaves de API**. Consulte a [referência da API REST](/pt-BR/api/rest) para todos os endpoints, ou acesse [http://localhost:1349/api/docs](http://localhost:1349/api/docs) para a referência interativa.

### Multiusuário e equipes {#multi-user-teams}

Ative vários usuários com controle de acesso baseado em papéis:

- **Admin**: acesso total, com gerenciamento de usuários, equipes, configurações e de todos os arquivos/pipelines/chaves de API
- **Usuário**: usa as ferramentas e gerencia os próprios arquivos/pipelines/chaves de API

Crie equipes em **Configurações → Equipes** para agrupar usuários.

Defina `AUTH_ENABLED=true` (ou `false` para uso individual/próprio, sem login).

## Use no celular {#use-it-from-your-phone}

O SnapOtter funciona em navegadores móveis e você pode instalá-lo como um app. Abra a sua instância no celular e depois:

- **iPhone / iPad (Safari):** toque em Compartilhar e depois em **Adicionar à Tela de Início**.
- **Android (Chrome):** abra o menu do navegador e toque em **Instalar app**.

O app instalado abre em uma janela própria, direto na sua instância.

Um detalhe: os navegadores só oferecem o prompt de instalação por HTTPS. Um endereço HTTP simples na sua LAN continua funcionando bem em uma aba do navegador; para a instalação de verdade, coloque a instância atrás de um proxy reverso com certificado (consulte o [guia de implantação](/pt-BR/guide/deployment)).

Em celulares e tablets, as ferramentas de imagem mostram um botão **Tirar foto** ao lado do botão de upload. Fotografe um recibo ou um quadro branco e a imagem vai direto para a ferramenta.
