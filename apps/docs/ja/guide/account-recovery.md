---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: 4e425f53ee15
i18n_hash_version: 2
---
# アカウントの復旧 {#account-recovery}

SnapOtter からロックアウトされた場合（多くは、もはや満たせなくなった MFA ポリシーが原因です）、データベースクライアントを使わずにコンテナ内部から復旧できます。復旧コマンドはオフラインで動作し、コンテナへのシェルアクセスが必要です。これはすでにインスタンスを完全に制御できることを意味します。

## どの障壁にぶつかっているのか？ {#which-wall-am-i-hitting}

SnapOtter のログインは、2 つの独立した MFA ゲートを適用します。まずは切り分けてください。

```bash
docker exec -it snapotter snapotter-admin status
```

これは現在の MFA ポリシーと、どのユーザーが TOTP を登録済みかを出力します。

- **「ログイン前に MFA の登録が必要です」（そしてアプリを一度も設定していない場合）:**
  ポリシーは MFA を要求していますが、登録がありません。ポリシーを緩和してください。
- **生成できないコードの入力を求められる**（スマートフォンとリカバリーコードの両方を紛失した場合）: あなたのアカウントは登録済みです。その登録を解除してください。

## MFA ポリシーを緩和する {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

これはポリシーを `optional` に戻します。再起動せずに次回のログインで適用されます。設定するのは常に `optional` だけなので、強制を再び有効にすることはできません。

## 特定ユーザーの TOTP 登録を解除する {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

そのユーザーに対してポリシーがまだ MFA を要求している場合、次は登録の障壁にぶつかるので、`reset-mfa-policy` も実行し、ログインして、設定から再登録してください。

## 忘れたパスワードをリセットする {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

`[password]` を省略すると、CLI は生成した一時パスワードを出力します。いずれの場合も、そのユーザーの有効なセッション、API キー、ログイン失敗のスロットルウィンドウが消去され、SnapOtter は次回のログイン時にパスワード変更を要求します。

## 管理者アカウントを初期作成する {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

既存の管理者アカウントで一切サインインできない場合に使用します。`[username]` の既定値は `DEFAULT_USERNAME`（`admin`）で、`[password]` を省略すると初回ログイン時に変更が必要な一時パスワードが出力されます。

## スロットル中または無効化されたユーザーを解除する {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

これは Redis 内の `LOGIN_THROTTLED` ウィンドウを消去し、ユーザーが無効化されていた場合はアカウントのロールを復元します。

## 古いイメージとフォールバック {#older-images-and-fallbacks}

`snapotter-admin` ラッパーが存在する前にビルドされたイメージでは、スクリプトを直接呼び出してください。

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
```

どのバージョンでも最後の手段として、データベースでポリシーを設定します。オールインワンイメージでは、Postgres はコンテナ内部で動作します。

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

複数コンテナ構成では、代わりに `psql` を自分の `DATABASE_URL` に向けてください。

## MFA ではなく SSO からロックアウトされた場合は？ {#locked-out-of-sso-not-mfa}

強制された SSO ログインが失敗している場合は、代わりに緊急用のローカルアカウントを使ってください。SSO を強制する前に、設定 > セキュリティで `ssoBreakGlassUsername` をローカル管理者に設定し、そのアカウントのパスワードでログインします。
