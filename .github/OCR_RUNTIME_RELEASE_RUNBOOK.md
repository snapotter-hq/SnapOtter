# OCR runtime release trust runbook

This runbook is for SnapOtter maintainers who provision or rotate the Ed25519
identity used to sign accurate OCR runtime indexes. Run key-generation commands
on a clean, offline administration machine. Never generate or decode the private
key on a GitHub runner, paste it into an issue, or commit any generated file.

The release workflows intentionally accept only standard, padded, byte-for-byte
canonical base64. PEM bytes are significant: do not rewrap or edit them after
encoding.

## Generate an Ed25519 identity offline

Create a new encrypted working directory or removable volume, disconnect the
machine from all networks, and run:

```bash
umask 077
mkdir ocr-runtime-signing-2026-01
cd ocr-runtime-signing-2026-01
openssl genpkey -algorithm ED25519 -out ocr-runtime-index-private.pem
openssl pkey -in ocr-runtime-index-private.pem -pubout \
  -out ocr-runtime-index-public.pem
openssl base64 -A -in ocr-runtime-index-private.pem \
  -out OCR_RUNTIME_INDEX_SIGNING_KEY_B64.txt
openssl base64 -A -in ocr-runtime-index-public.pem \
  -out OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64.txt
printf '%s\n' 'ocr-runtime-2026-01' > OCR_RUNTIME_INDEX_KEY_ID.txt
```

The key ID must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` and must be new for
every rotation. `openssl base64 -A` emits one canonical base64 string without a
trailing newline. Verify both round trips and the key relationship before the
machine reconnects:

```bash
cmp ocr-runtime-index-private.pem \
  <(openssl base64 -d -A -in OCR_RUNTIME_INDEX_SIGNING_KEY_B64.txt)
cmp ocr-runtime-index-public.pem \
  <(openssl base64 -d -A -in OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64.txt)
openssl pkey -in ocr-runtime-index-private.pem -check -noout
cmp \
  <(openssl pkey -in ocr-runtime-index-private.pem -pubout -outform DER) \
  <(openssl pkey -pubin -in ocr-runtime-index-public.pem -outform DER)
```

## Provision GitHub

Confirm `gh auth status` shows the `snapotter-hq` account. Choose exactly one
scope. Repository settings are simplest; organization settings are appropriate
only when SnapOtter has explicitly been granted access to the org secret and
variables. Keep the secret and both variables in the same scope.

Repository-scoped provisioning commands (these commands write GitHub state; run
them only in an approved maintenance window):

```bash
gh secret set --repo snapotter-hq/SnapOtter OCR_RUNTIME_INDEX_SIGNING_KEY_B64 \
  < OCR_RUNTIME_INDEX_SIGNING_KEY_B64.txt
gh variable set --repo snapotter-hq/SnapOtter OCR_RUNTIME_INDEX_KEY_ID \
  --body "$(cat OCR_RUNTIME_INDEX_KEY_ID.txt)"
gh variable set --repo snapotter-hq/SnapOtter OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64 \
  --body "$(cat OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64.txt)"
```

Organization-scoped alternative, restricted to this repository:

```bash
gh secret set --org snapotter-hq --repos SnapOtter \
  OCR_RUNTIME_INDEX_SIGNING_KEY_B64 < OCR_RUNTIME_INDEX_SIGNING_KEY_B64.txt
gh variable set --org snapotter-hq --repos SnapOtter OCR_RUNTIME_INDEX_KEY_ID \
  --body "$(cat OCR_RUNTIME_INDEX_KEY_ID.txt)"
gh variable set --org snapotter-hq --repos SnapOtter \
  OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64 \
  --body "$(cat OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64.txt)"
```

Do not add whitespace, quotes, or a newline to any stored value. GitHub cannot
read a secret back, so the signing step independently checks its canonical
encoding and proves that it derives the configured public key.

## offline backup

Keep two encrypted offline backup copies in separate controlled locations. Each
copy must contain the private PEM, its canonical base64 file, the public PEM,
its canonical base64 file, the key-ID file, creation date, responsible
maintainers, and SHA-256 checksums. Require two-person access, test restoration
on an offline machine, and record the test without recording key material.

After backup verification, destroy the temporary encrypted working volume.
Deleting individual files is not reliable erasure on SSDs. Never put the backup
in source control, CI artifacts, chat, or an unencrypted cloud drive.

## rotation

1. Stop or wait for all release workflows; never change trust material during a
   release run.
2. Generate a new identity and a new key ID offline, and verify its backup.
3. Update the private secret and both public variables together in the selected
   scope.
4. Run the preflight below, then create a new release. Its exact image digests
   bake the new public identity, and its final two-target index is signed with
   the matching private identity.
5. Confirm both native post-sign matrix jobs pass before public image manifests
   move. Do not re-sign or overwrite an existing immutable release.
6. Retain the old private key offline while an immutable release may need an
   authorized recovery rerun. Record a retirement date and destroy it under the
   project's key-retention policy.

## recovery

If the active private key is lost but not suspected compromised, pause releases
and restore it from the offline backup. If no backup is recoverable, generate a
new identity for a new release; the old key cannot be reconstructed and an
existing immutable release must not be silently re-signed.

If compromise is suspected, disable release workflow access, preserve audit
logs, revoke the configured secret, generate a new identity offline, and rotate
the secret plus both variables before any new release. Do not republish objects
under an existing version. Document which image versions trust the affected key
and communicate the incident through the security process.

A public/private mismatch, non-canonical encoding, oversized signed index, or
image-baked key mismatch is a hard release failure. Fix configuration; never
bypass the gate.

## Runner and release preflight

The mandatory GPU runner must have every exact label in
`[self-hosted, linux, x64, snapotter-nvidia]`, a working NVIDIA Container
Toolkit, `nvidia-smi`, Docker access, and capacity for a 4 GiB constrained test.
Organization-shared runners are valid, but repository runner listings alone do
not prove that one is available.

Read-only GitHub checks:

```bash
gh auth status
gh variable get OCR_RUNTIME_INDEX_KEY_ID --repo snapotter-hq/SnapOtter
gh variable get OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64 \
  --repo snapotter-hq/SnapOtter > /tmp/ocr-runtime-public.b64
test "$(openssl base64 -A -in <(openssl base64 -d -A \
  -in /tmp/ocr-runtime-public.b64))" = "$(cat /tmp/ocr-runtime-public.b64)"
gh secret list --repo snapotter-hq/SnapOtter \
  | grep -q '^OCR_RUNTIME_INDEX_SIGNING_KEY_B64[[:space:]]'
gh api repos/snapotter-hq/SnapOtter/actions/runners \
  --jq '.runners[] | {name, status, labels: [.labels[].name]}'
```

If trust is organization-scoped, also audit `gh variable list --org
snapotter-hq` and `gh secret list --org snapotter-hq`, and verify their selected
repository access in GitHub settings. The GPU runner itself must pass:

```bash
nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
docker info --format '{{json .Runtimes}}' | grep -q 'nvidia'
docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi
```

Finally, parse both workflow files locally and run the focused release contract
test before starting semantic release:

```bash
ruby -e 'require "yaml"; YAML.parse_file(".github/workflows/release.yml"); YAML.parse_file(".github/workflows/ai-bundles.yml")'
pnpm exec vitest run --config vitest.config.ts \
  tests/unit/infra/ocr-release-workflow.test.ts
```
