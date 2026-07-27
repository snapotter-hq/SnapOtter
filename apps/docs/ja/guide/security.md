---
description: "SnapOtter のセキュリティ強化ガイド。コンテナのセキュリティ、ネットワーク分離、Docker シークレット、Kubernetes デプロイ、コンプライアンス成果物を扱います。"
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 6082010b0b69
i18n_hash_version: 2
---

# セキュリティと強化 {#security-hardening}

SnapOtter はファイルを完全にあなたのインフラ上で処理します。プロジェクトの改善に役立てるため、デフォルトで匿名かつ内容を含まないプロダクトアナリティクスとクラッシュレポートを送信します。あなたのファイル、ファイル名、ファイルの内容、OCR の出力、画像のメタデータ、ドキュメントのテキストを送信することは決してありません。任意のフィードバックは、ユーザーが送信したときにのみ、かつアナリティクスが有効な場合にのみ送信され、連絡先フィールドは明示的な連絡先の同意がある場合にのみ含まれます。管理者は Settings > System > Privacy でアナリティクスとフィードバック収集をワンクリックでオフにでき、リビルドは不要です。ファイル処理は常にコンテナ内に留まります。

コンテナは専用の非 root ユーザー（`snapotter`）として実行され、必要最小限のセットを除くすべての Linux capability が削除されています。完全な脆弱性開示ポリシーとセキュリティアーキテクチャについては、GitHub の [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) を参照してください。

## コンテナの強化 {#container-hardening}

正規の [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) および [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) Compose ファイルが信頼できる情報源です。短縮された例を運用環境にコピーしないでください。確認したリリース タグからファイルをデプロイします。

どちらのスタックも次の制御を適用します。

- メモリ、スワップ、CPU、および PID の制限には、暴走したネイティブ処理が含まれています。
- すべてのサービスで、すべての Linux 機能が削除されます。アプリケーションは、ボリューム所有権、一方向 `gosu` ID ドロップ、および正常な信号転送のために `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` のみを追加し直します。 PostgreSQL と Redis は、公式エントリポイントに必要なサブセットのみを受け取ります。
- `security_opt: [no-new-privileges:true]` は、アプリケーション、PostgreSQL、および Redis コンテナー内のプロセスが追加の権限を取得できないようにします。これは `gosu` との互換性を維持します。エントリポイントは root として開始され、ボリュームを準備し、専用の `snapotter` ユーザーにのみドロップされます。
- PostgreSQL および Redis のイメージ入力はダイジェストによって固定されます。同様に、アプリケーションは `latest` ではなく、検証済みのリリース タグまたはダイジェストに固定する必要があります。
- ヘルスチェック、制限された JSON ログローテーション、永続的な Redis AOF、および再起動ポリシーは、正規ファイルで一元的に定義されます。

インターネットに接続する展開の場合は、ポート 1349 をループバックにバインドし、維持されているリバース プロキシで TLS を終了します。一意の PostgreSQL および Redis 認証情報を生成し、保護されたファイルまたはシークレット マネージャーにシークレットを保存し、初期管理者パスワードをすぐに変更します。

### `read_only` が {#why-read-only-is-not-set} に設定されない理由

PUID/PGID の再マッピングにより起動時に `/etc/passwd` および `/etc/group` に書き込まれるため、`read_only: true` は設定されません。 PUID/PGID の代わりに Docker の `--user` フラグまたは Kubernetes `runAsUser` を使用すると、読み取り専用のルート ファイルシステムを安全に有効にすることができます。

## ネットワーク分離 {#network-isolation}

ファイル処理はローカルですが、デフォルトのインストールは**出力のないシステム**ではありません。テレメトリが有効な場合、匿名の製品分析では PostHog が使用され、クラッシュ レポートでは Sentry が使用されます。 `SNAPOTTER_TELEMETRY=0` を設定 (または [設定] > [システム] > [プライバシー] で分析を無効に) して両方をオフにします。 SnapOtter は、アップロードされたファイル、ファイル名、OCR 出力、ドキュメント テキスト、またはその他のファイル コンテンツをこれらのイベントに含めることはありません。

その他のアウトバウンド トラフィックは機能主導型です。AI バンドル/モデルのインストールは、署名されたリリース入力をダウンロードします。 URL インポートでは、ユーザーが要求したパブリック URL を取得します。明示的に構成された OIDC、SAML、OpenTelemetry、Webhook、S3 互換ストレージ、または同様の統合は、管理者が選択した宛先に接続します。ランタイムでのモデルのダウンロードはデフォルトで無効です。自動フォールバック ダウンロードを明示的に有効にする場合にのみ、`SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` を設定してください。[オフライン バンドル インポート](/ja/guide/deployment) は、ランタイム モデルの出力なしで AI 機能をプロビジョニングできます。

**ファイアウォールの推奨事項:**

|シナリオ|アウトバウンドルール|
|---|---|
|エアギャップ|`SNAPOTTER_TELEMETRY=0` と `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0` を設定し、オフライン AI バンドル インポートを使用し、URL インポートと外部統合を無効にして、下りをブロックします|
|デフォルトのテレメトリ|ブラウザ/ネットワーク ログにリストされている PostHog および Sentry エンドポイントを許可します。ポリシーで許可されていない場合はテレメトリを無効にする|
|AI バンドルが必要|インストール中に、`huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` への HTTPS を許可します。次にそれらのホストをブロックします|
|外部統合|管理者が正確に構成した OIDC/SAML/OTLP/webhook/object-storage 宛先のみを許可します|

バンドル アーカイブは、Hugging Face の Xet ストレージから提供されます。これにより、`*.xethub.hf.co` エンドポイント経由で並行して転送され、複数 GB のバンドルのダウンロードが高速になります。ファイアウォールで `huggingface.co` は許可されるが `*.xethub.hf.co` はブロックされる場合でも、インストールは成功しますが、より遅い単一ストリーム ダウンロードにフォールバックするため、高速パス上に留まるように Xet ホストをホワイトリストに登録します。完全なオフライン インストールでは、これをすべてスキップし、代わりに [オフライン バンドル インポート](/ja/guide/deployment) を使用できます。

リバース プロキシ構成 (Nginx、Traefik、Caddy、Cloudflare トンネル) については、[導入ガイド](/ja/guide/deployment#reverse-proxy) を参照してください。

## Docker シークレット {#docker-secrets}

本番デプロイでは、シークレットを平文の環境変数として渡すことは避けてください。エントリーポイントは Docker の `_FILE` 規約をサポートしています。シークレットをファイルとしてマウントし、対応する `_FILE` 変数にそのパスを設定します。

**サポートされるシークレット：**

| 変数 | `_FILE` に相当 |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Compose のシークレットを使った例：**

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
Docker Compose のシークレット（Swarm なし）には Compose v2.23 以降が必要です。
:::

## Kubernetes デプロイ {#kubernetes-deployment}

エントリーポイントは、コンテナがすでに非 root として実行されている（たとえば Kubernetes の `runAsUser` 経由）ことを検出し、gosu の権限降格を自動的にスキップします。その場合、自らマウントされたボリュームを chown できないため、書き込み可能かどうかを検証し、書き込めない場合は実行可能なガイダンスを出して早期に終了します。`fsGroup` や外来 UID の構成（TrueNAS、OpenShift）については [ストレージの権限](/ja/guide/deployment#storage-permissions) を参照してください。

**推奨される Pod の SecurityContext：**

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

`runAsUser: 999` が Pod レベルで設定されているため、エントリーポイントは gosu を完全にスキップします。これにより、`allowPrivilegeEscalation: false` と `drop: [ALL]` の capability を競合なしに使えます。

リソースのサイジングについては、[ハードウェア要件](/ja/guide/deployment#hardware-requirements) を参照してください。

## バックアップとリカバリ {#backup-and-recovery}

実稼働 Compose スタックは 4 つのボリュームを定義します。 PostgreSQL、Redis、およびファイルの状態が同じ時点を表すように、調整されたバックアップを取得する前にイングレスを停止し、アクティブなジョブを終了させます。

|音量|コンテンツ|回復治療|
|---|---|---|
|`SnapOtter-pgdata`|PostgreSQL ユーザー、設定、パイプライン、ジョブ、ファイル メタデータ、監査ログ|致命的;ポータブルリカバリにフェイルファスト論理ダンプを使用する|
|`SnapOtter-data`|保存されたライブラリ オブジェクト、ログ、および AI 状態 (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|ボリューム全体をバックアップします。スペースを節約するために、すべての AI 状態を意図的に省略し、そのバンドルを再インストールします|
|`SnapOtter-redisdata`|耐久性のある BullMQ キュー状態のための Redis AOF|アプリを一時停止して `SAVE` を強制した後、バックアップします。キューに入れられた作業を正確に再開するために必要|
|`SnapOtter-workspace`|一時オブジェクトストレージキー (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|すべてのジョブがドレインまたはキャンセルされた後はバックアップしないでください。ジョブがアクティブな間は決して破棄しないでください|

Compose は通常、ボリューム名の前にプロジェクト名を付けます。 `SnapOtter-data` などの表示名が Docker ボリューム名であると想定するのではなく、マウントされたコンテナーから実際のソース ボリュームを解決します。

### データベースのバックアップ {#database-backup}

PostgreSQL のカスタム アーカイブ形式を使用し、バックアップが完了したものとして扱う前にアーカイブを検証します。

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

すべてのバックアップを分離スタックに復元し、データベース レコードとファイルのチェックサムを確認し、アプリケーションを起動して、すべてのバックアップをテストします。リポジトリの `tests/qa/backup-restore-drill.sh` は、明示的な `QA_IMAGE` に対するゲートの解放を自動化します。

代わりにプラットフォームがクラッシュ整合性ボリューム スナップショットを取得する場合は、最初にスタック全体を停止し、すべての重要なボリュームを 1 つのセットとしてスナップショットします。実行中のコンテナからの生の PostgreSQL データ ディレクトリのコピーは、サポートされている論理バックアップではありません。

### ファイルとキューのバックアップ {#file-and-queue-backup}

ファイルとキューのボリュームをキャプチャする前に、アプリケーションを一時停止します。 `docker inspect` を使用して実際のボリューム名を解決し、Redis に現在の状態を強制的に保持させ、所有権とアクセス許可を保持してアーカイブします。

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

アプリケーションの前に Redis を再起動します。 `/data/ai` を意図的に除外する場合は、モデルや仮想環境なしで `installed.json` レコードを保存するのではなく、AI サブツリー全体を削除します。バックアップ ファイルは暗号化され、アクセスが制御され、SnapOtter を実行しているホストから分離された状態に保たれます。

## コンプライアンス成果物 {#compliance-artifacts}

各 SnapOtter リリースには、次のセキュリティ アーティファクトが含まれています。

| アーチファクト | 形式 | どこで見つけられますか |
|---|---|---|
| 件名のバインディングを解放する | 正規の JSON + GitHub 証明書 | [GitHub リリース](https://github.com/snapotter-hq/SnapOtter/releases) アセット: `snapotter-v{version}-release-subjects.json` |
| アーカイブ SBOM | CycloneDX および SPDX JSON | リリースアセット: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| 画像SBOM | CycloneDX および SPDX JSON | リリースアセット: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| 脆弱性スキャン | Trivy JSON | `archive-linux-{arch}` または `image-linux-{arch}` プレフィックスが一致するアセットをリリースする |
| 脆弱性スキャン | SARIF | [GitHubセキュリティ](https://github.com/snapotter-hq/SnapOtter/security)タブ |
| 静的解析 | CodeQL (JS/TS + Python) | [GitHub セキュリティ](https://github.com/snapotter-hq/SnapOtter/security) タブ、毎週 + PR ごとに実行 |
| 依存関係のレビュー | GitHub ネイティブ | PR ごとのチェック、重大度の高い追加で失敗する |
| Python 依存関係の監査 | pip-audit | プッシュごとの CI 実行ログ |
| セキュリティポリシー | Markdown | リポジトリ内の [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 依存関係の更新 | Dependabot | npm、pip、Docker、アクションの自動化された毎週の PR |

**独自のスキャンを実行する:**

リリース対象のマニフェストをダウンロードし、それがリリース ワークフローによって証明されていることを確認します。

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

マニフェストには、`releaseTag`、`releaseCommit`、および `workflowTriggerCommit` が個別に記録されます。 `releaseCommit` が不変タグから剥がされたコミットであることを確認してから、使用したアーカイブ、イメージ、SBOM、またはスキャンの SHA-256 ダイジェストを `subjects` のエントリと照合して確認します。この区別は意図的なものです。新しく作成されたリリース コミットをチェックアウトしても、ワークフローの OIDC 資格情報のコミット ID は変更されません。

ダウンロードした SBOM または画像を直接スキャンすることもできます。

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
イメージ SBOMs とスキャンは、そのリリース用に公開されたアーキテクチャ固有のイメージを正確に反映しています。アーカイブ SBOMs とスキャンでは、事前構築されたアーカイブを個別に説明します。デプロイメント後にインストールされた AI モデル バンドルは、実行時にダウンロードされるため、これらの SBOMs には含まれません。
:::
