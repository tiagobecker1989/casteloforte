#!/bin/sh
# Gera certificados de TESTE (CA, servidor e cliente) para o simulador da API Pix (scripts/fake-sicredi.mjs).
set -e
D=${1:-/tmp/certs}; mkdir -p "$D"; cd "$D"
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.pem -subj "/CN=Teste CA" -days 30 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout srv.key -out srv.csr -subj "/CN=localhost" 2>/dev/null
printf "subjectAltName=DNS:localhost,IP:127.0.0.1" > san.cnf
openssl x509 -req -in srv.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out srv.pem -days 30 -extfile san.cnf 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout cli.key -out cli.csr -subj "/CN=cliente-sicredi" 2>/dev/null
openssl x509 -req -in cli.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out cli.pem -days 30 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout outra.key -out outra.csr -subj "/CN=outra" 2>/dev/null
echo "certificados de teste em $D"
