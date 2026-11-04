---
description: "SnapOtter のセキュリティハードニングガイドです。コンテナのセキュリティ、ネットワーク分離、Docker シークレット、Kubernetes へのデプロイ、コンプライアンス関連の成果物を説明します。"
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: 443011a92d11
i18n_hash_version: 2
---

# セキュリティとハードニング {#security-hardening}

SnapOtter は、ファイルの処理をすべてお客様のインフラ内で行います。プロジェクトの改善に役立てるため、デフォルトでは、内容を含まない匿名のプロダクト分析とクラッシュレポートを送信します。ファイル、ファイル名、ファイルの内容、OCR の出力、画像のメタデータ、ドキュメントのテキストが送信されることはありません。任意のフィードバックは、ユーザーが送信した後で、かつ分析が有効な場合にのみ送信され、連絡先の項目は明示的な連絡の同意がある場合にのみ含まれます。管理者は Settings > System > Privacy で、分析とフィードバックの収集をワンクリックでオフにでき、再ビルドは不要です。ファイル処理は常にコンテナの内部で完結します。

コンテナは専用の非 root ユーザー（`snapotter`）として動作し、必要最小限のものを除くすべての Linux ケーパビリティが削除されています。脆弱性の開示ポリシー全文とセキュリティアーキテクチャについては、GitHub 上の [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) を参照してください。

## コンテナのハードニング {#container-hardening}

標準の [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) および [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) の Compose ファイルが正となるものです。簡略化した例を本番環境にコピーせず、検証したリリースタグのファイルをデプロイしてください。

どちらのスタックにも、次の制御が適用されます。

- メモリ、スワップ、CPU、PID の制限により、ネイティブ処理の暴走を封じ込めます。
- すべてのサービスで、Linux ケーパビリティをすべて削除します。アプリケーションが追加し直すのは、ボリュームの所有権設定、一方向の `gosu` によるアイデンティティの切り替え、シグナルの適切な転送のための `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` のみです。PostgreSQL と Redis には、それぞれ公式のエントリポイントに必要なサブセットだけを付与します。
- `security_opt: [no-new-privileges:true]` により、アプリケーション、PostgreSQL、Redis の各コンテナ内のプロセスが追加の権限を取得することを防ぎます。これは `gosu` と両立します。エントリポイントは root で開始してボリュームを準備し、その後で専用の `snapotter` ユーザーに切り替えるだけだからです。
- PostgreSQL と Redis のイメージはダイジェストで固定されています。アプリケーションも同様に、`latest` ではなく、検証済みのリリースタグまたはダイジェストに固定してください。
- ヘルスチェック、サイズ制限付きの JSON ログローテーション、永続的な Redis AOF、再起動ポリシーは、標準のファイルで一元的に定義されています。

インターネットに公開するデプロイでは、ポート 1349 をループバックにバインドし、メンテナンスされているリバースプロキシで TLS を終端してください。PostgreSQL と Redis には固有の認証情報を生成し、シークレットは保護されたファイルまたはシークレットマネージャーに保存し、初期の管理者パスワードはすぐに変更してください。

### `read_only` を設定していない理由 {#why-read-only-is-not-set}

PUID/PGID の再マッピングは起動時に `/etc/passwd` と `/etc/group` に書き込むため、`read_only: true` は設定されていません。PUID/PGID の代わりに Docker の `--user` フラグや Kubernetes の `runAsUser` を使う場合は、読み取り専用のルートファイルシステムを安全に有効にできます。

## ネットワーク分離 {#network-isolation}

ファイル処理はローカルで行われますが、デフォルトのインストールは**外向き通信のないシステムではありません**。テレメトリが有効な場合、匿名のプロダクト分析には PostHog を、クラッシュレポートには Sentry を使用します。`SNAPOTTER_TELEMETRY=0` を設定する（または Settings > System > Privacy で分析を無効にする）と、両方をオフにできます。SnapOtter は、アップロードされたファイル、ファイル名、OCR の出力、ドキュメントのテキスト、その他のファイルの内容を、これらのイベントに含めることはありません。

その他の外向き通信は機能に応じて発生します。AI バンドル/モデルのインストールでは署名済みのリリース入力をダウンロードし、URL インポートではユーザーが指定した公開 URL を取得し、明示的に設定した OIDC、SAML、OpenTelemetry、Webhook、S3 互換ストレージなどの連携では、管理者が選んだ接続先と通信します。ランタイムでのモデルのダウンロードは、デフォルトで無効です。自動フォールバックのダウンロードを明示的に有効にする場合にのみ、`SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` を設定してください。[オフラインバンドルのインポート](/ja/guide/deployment)を使うと、ランタイムでのモデルの外向き通信なしに AI 機能をプロビジョニングできます。

**ファイアウォールの推奨設定:**

| シナリオ | アウトバウンドのルール |
|---|---|
| エアギャップ環境 | `SNAPOTTER_TELEMETRY=0` と `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0` を設定し、オフラインの AI バンドルのインポートを使い、URL インポートと外部連携を無効にしてから、外向き通信をブロックします |
| デフォルトのテレメトリ | ブラウザ/ネットワークのログに表示される PostHog と Sentry のエンドポイントを許可します。ポリシー上許可できない場合は、テレメトリを無効にします |
| AI バンドルが必要な場合 | インストール中は `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` への HTTPS を許可し、その後それらのホストをブロックします |
| 外部連携 | 管理者が設定した OIDC/SAML/OTLP/Webhook/オブジェクトストレージの接続先だけを、正確に許可します |

バンドルのアーカイブは Hugging Face の Xet ストレージから配信されます。これは `*.xethub.hf.co` エンドポイントを通じて並列に転送されるため、数 GB のバンドルを高速にダウンロードできます。ファイアウォールで `huggingface.co` を許可していても `*.xethub.hf.co` をブロックしている場合、インストールは成功しますが、低速な単一ストリームのダウンロードにフォールバックします。高速な経路を維持するには、Xet のホストを許可リストに追加してください。完全にオフラインでインストールする場合は、これらをすべてスキップして、代わりに[オフラインバンドルのインポート](/ja/guide/deployment)を使えます。

リバースプロキシの設定（Nginx、Traefik、Caddy、Cloudflare Tunnels）については、[デプロイガイド](/ja/guide/deployment#reverse-proxy)を参照してください。

## Docker シークレット {#docker-secrets}

本番環境のデプロイでは、シークレットをプレーンテキストの環境変数として渡さないでください。エントリポイントは Docker の `_FILE` の規約をサポートしています。シークレットをファイルとしてマウントし、対応する `_FILE` 変数にそのパスを設定します。

**サポートされるシークレット:**

| 変数 | `_FILE` に相当するもの |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Compose シークレットの例:**

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD_FILE=/run/secrets/snapotter_password
      - COOKIE_SECRET_FILE=/run/secrets/cookie_secret
    secrets:
      - snapotter_password
      - cookie_secret

secrets:
  snapotter_password:
    file: ./secrets/snapotter_password.txt
  cookie_secret:
    file: ./secrets/cookie_secret.txt
```

::: tip 
Docker Compose のシークレット（Swarm を使わない場合）には、Compose v2.23 以降が必要です。
:::

## Kubernetes へのデプロイ {#kubernetes-deployment}

エントリポイントは、コンテナがすでに非 root で実行されていること（たとえば Kubernetes の `runAsUser` による場合）を検出し、gosu による権限の切り替えを自動的にスキップします。この場合、マウントされたボリュームを自身で chown できないため、ボリュームが書き込み可能かを確認し、そうでなければ対処方法を示して早期に終了します。`fsGroup` や他の UID の構成（TrueNAS、OpenShift）については、[ストレージの権限](/ja/guide/deployment#storage-permissions)を参照してください。

**推奨される Pod の SecurityContext:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: snapotter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: snapotter
  template:
    metadata:
      labels:
        app: snapotter
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        fsGroup: 999
      containers:
        - name: snapotter
          image: snapotter/snapotter:latest
          ports:
            - containerPort: 1349
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 6Gi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /data
            - name: workspace
              mountPath: /tmp/workspace
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: snapotter-data
        - name: workspace
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
```

`runAsUser: 999` が Pod レベルで設定されているため、エントリポイントは gosu を完全にスキップします。これにより、`allowPrivilegeEscalation: false` と `drop: [ALL]` のケーパビリティを競合なく使えます。

リソースのサイジングについては、[ハードウェア要件](/ja/guide/deployment#hardware-requirements)を参照してください。

## バックアップとリカバリ {#backup-and-recovery}

本番用の Compose スタックには 4 つのボリュームが定義されています。PostgreSQL、Redis、ファイルの状態が同じ時点を表すように、調整されたバックアップを取る前に、受信を止めて実行中のジョブが終わるのを待ってください。

| ボリューム | 内容 | リカバリでの扱い |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL のユーザー、設定、パイプライン、ジョブ、ファイルのメタデータ、監査ログ | 重要。ポータブルなリカバリには、フェイルファスト方式の論理ダンプを使用します |
| `SnapOtter-data` | 保存済みのライブラリオブジェクト、ログ、AI の状態（`/data/files, /data/logs, /data/ai, /data/ai/venv`） | ボリューム全体をバックアップします。容量を節約するには、AI の状態をすべて意図的に除外し、バンドルを再インストールします |
| `SnapOtter-redisdata` | 永続的な BullMQ キューの状態のための Redis AOF | アプリを一時停止し、`SAVE` を強制した後でバックアップします。キュー内の作業を正確に再開するために必要です |
| `SnapOtter-workspace` | 一時的なオブジェクトストレージのキー（`/tmp/workspace/uploads, /tmp/workspace/outputs`） | すべてのジョブが完了またはキャンセルされた後はバックアップしないでください。ジョブが実行中の間は、決して破棄しないでください |

Compose は通常、ボリューム名の先頭にプロジェクト名を付けます。`SnapOtter-data` のような表示名が Docker のボリューム名だと決めつけず、マウントされたコンテナから実際の元のボリュームを特定してください。

### データベースのバックアップ {#database-backup}

PostgreSQL のカスタムアーカイブ形式を使い、アーカイブを検証してからバックアップが完了したと見なしてください。

```bash
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore only into a fresh/disposable target first; any SQL error fails the command.
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

すべてのバックアップは、分離したスタックにリストアし、データベースのレコードとファイルのチェックサムを確認し、アプリケーションを起動して検証してください。リポジトリの `tests/qa/backup-restore-drill.sh` は、明示的な `QA_IMAGE` に対して、そのリリースゲートを自動化します。

代わりにプラットフォームがクラッシュコンシステントなボリュームのスナップショットを取る場合は、まずスタック全体を停止し、重要なボリュームすべてを 1 つのセットとしてスナップショットしてください。実行中のコンテナから PostgreSQL のデータディレクトリを生のままコピーしたものは、サポートされる論理バックアップではありません。

### ファイルとキューのバックアップ {#file-and-queue-backup}

ファイルとキューのボリュームを取得する前に、アプリケーションを一時停止してください。`docker inspect` を使って実際のボリューム名を特定し、Redis に現在の状態を強制的に永続化させ、所有者とパーミッションを保持したままアーカイブします。

```bash
docker stop SnapOtter
docker exec SnapOtter-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE
docker stop SnapOtter-redis

DATA_VOLUME="$(docker inspect SnapOtter --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
REDIS_VOLUME="$(docker inspect SnapOtter-redis --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"

install -d -m 700 backup
docker run --rm -v "$DATA_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-data.tar.gz -C /source .
docker run --rm -v "$REDIS_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-redis.tar.gz -C /source .
sha256sum backup/snapotter-*.tar.gz > backup/SHA256SUMS
```

アプリケーションより先に Redis を再起動してください。`/data/ai` を意図的に除外する場合は、モデルや仮想環境のない `installed.json` のレコードだけを残さず、AI のサブツリー全体を削除してください。バックアップファイルは暗号化し、アクセスを制御し、SnapOtter を実行しているホストとは別の場所に保管してください。

## コンプライアンス関連の成果物 {#compliance-artifacts}

SnapOtter の各リリースには、次のセキュリティ関連の成果物が含まれます。

| 成果物 | 形式 | 入手場所 |
|---|---|---|
| リリース対象のバインディング | 正規化された JSON と GitHub のアテステーション | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) のアセット: `snapotter-v{version}-release-subjects.json` |
| アーカイブの SBOM | CycloneDX と SPDX の JSON | リリースアセット: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| イメージの SBOM | CycloneDX と SPDX の JSON | リリースアセット: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| 脆弱性スキャン | Trivy の JSON | 一致する `archive-linux-{arch}` または `image-linux-{arch}` のプレフィックスを持つリリースアセット |
| 脆弱性スキャン | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) タブ |
| 静的解析 | CodeQL（JS/TS と Python） | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) タブ。毎週およびプルリクエストごとに実行 |
| 依存関係のレビュー | GitHub ネイティブ | プルリクエストごとのチェック。重大度の高い追加があると失敗します |
| Python の依存関係の監査 | pip-audit | プッシュごとの CI 実行ログ |
| セキュリティポリシー | Markdown | リポジトリ内の [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 依存関係の更新 | Dependabot | npm、pip、Docker、Actions に対する、毎週の自動プルリクエスト |

**自分でスキャンを実行する:**

リリース対象のマニフェストをダウンロードし、リリースワークフローによってアテステーションされていることを検証します。

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

マニフェストには、`releaseTag`、`releaseCommit`、`workflowTriggerCommit` が別々に記録されています。`releaseCommit` が、イミュータブルなタグから取り出されたコミットであることを確認し、次に、使用するアーカイブ、イメージ、SBOM、スキャン結果の SHA-256 ダイジェストを、`subjects` 内の対応するエントリと照合してください。この区別は意図的なものです。新しく作成されたリリースコミットをチェックアウトしても、ワークフローの OIDC 認証情報にあるコミットの ID は変わらないためです。

ダウンロードした SBOM やイメージを直接スキャンすることもできます。

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
イメージの SBOM とスキャン結果は、そのリリースで公開された、アーキテクチャ固有のイメージそのものを反映しています。アーカイブの SBOM とスキャン結果は、ビルド済みのアーカイブを個別に記述したものです。デプロイ後にインストールされる AI モデルバンドルは、ランタイムでダウンロードされるため、これらの SBOM には含まれません。
:::
