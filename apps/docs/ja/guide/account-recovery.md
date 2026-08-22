---
i18n_source_hash: 377cf113e7d8
i18n_provenance: machine
i18n_output_hash: 65113aec1e39
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

## 古いイメージとフォールバック {#older-images-and-fallbacks}

`snapotter-admin` ラッパーが存在する前にビルドされたイメージでは、スクリプトを直接呼び出してください。

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/mfa-recover.ts reset-mfa-policy
```

どのバージョンでも最後の手段として、データベースでポリシーを設定します。オールインワンイメージでは、Postgres はコンテナ内部で動作します。

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

複数コンテナ構成では、代わりに `psql` を自分の `DATABASE_URL` に向けてください。

## MFA ではなく SSO からロックアウトされた場合は？ {#locked-out-of-sso-not-mfa}

強制された SSO ログインが失敗している場合は、代わりに緊急用のローカルアカウントを使ってください。SSO を強制する前に、設定 > セキュリティで `ssoBreakGlassUsername` をローカル管理者に設定し、そのアカウントのパスワードでログインします。
