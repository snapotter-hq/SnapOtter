#!/usr/bin/env bash
set -e
: "${OCR_RUNTIME_INDEX_KEY_ID:?Set repository variable OCR_RUNTIME_INDEX_KEY_ID}"
: "${OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64:?Set repository variable OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64}"
: "${OCR_RUNTIME_INDEX_SIGNING_KEY_B64:?Set secret OCR_RUNTIME_INDEX_SIGNING_KEY_B64}"
[[ "${OCR_RUNTIME_INDEX_KEY_ID}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || {
  echo "::error::OCR runtime signing key ID is not a safe identifier"
  exit 1
}
umask 077
trap 'rm -f /tmp/ocr-index/private.pem /tmp/ocr-index/configured-public.pem /tmp/ocr-index/derived-public.pem' EXIT
printf '%s' "${OCR_RUNTIME_INDEX_SIGNING_KEY_B64}" | base64 --decode > /tmp/ocr-index/private.pem
printf '%s' "${OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64}" | base64 --decode > /tmp/ocr-index/configured-public.pem
[[ "$(base64 --wrap=0 < /tmp/ocr-index/private.pem)" == "${OCR_RUNTIME_INDEX_SIGNING_KEY_B64}" ]] || {
  echo "::error::OCR signing private key must use canonical base64"
  exit 1
}
[[ "$(base64 --wrap=0 < /tmp/ocr-index/configured-public.pem)" == "${OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64}" ]] || {
  echo "::error::OCR runtime public key must use canonical base64"
  exit 1
}
openssl pkey -in /tmp/ocr-index/private.pem -text -noout | grep -q ED25519 || {
  echo "::error::Configured OCR signing private key is not Ed25519"
  exit 1
}
openssl pkey -in /tmp/ocr-index/private.pem -pubout -out /tmp/ocr-index/derived-public.pem
openssl pkey -pubin -in /tmp/ocr-index/configured-public.pem -pubout -out /tmp/ocr-index/trusted-public.pem
openssl pkey -pubin -in /tmp/ocr-index/trusted-public.pem -text -noout | grep -q ED25519 || {
  echo "::error::Configured OCR runtime key is not Ed25519"
  exit 1
}
cmp \
  <(openssl pkey -pubin -in /tmp/ocr-index/derived-public.pem -outform DER) \
  <(openssl pkey -pubin -in /tmp/ocr-index/trusted-public.pem -outform DER) || {
    echo "::error::Signing key does not match the repository-trusted public key"
    exit 1
  }
openssl pkeyutl -sign -rawin \
  -inkey /tmp/ocr-index/private.pem \
  -in /tmp/ocr-index/ocr-runtime-index.unsigned.json \
  -out /tmp/ocr-index/ocr-runtime-index.signature
openssl pkeyutl -verify -rawin \
  -pubin -inkey /tmp/ocr-index/trusted-public.pem \
  -in /tmp/ocr-index/ocr-runtime-index.unsigned.json \
  -sigfile /tmp/ocr-index/ocr-runtime-index.signature
