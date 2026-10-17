#!/bin/sh
# Gera arquivos .doc, .docx e .pdf de TESTE com o LibreOffice (instale: apt-get install libreoffice-writer).
set -e
D=${1:-/tmp/docs}; mkdir -p "$D"; cd "$D"
printf 'Ata da reuniao da diretoria\n\nTexto de teste da Castelo Forte com acentuacao: coracao, oracao, Sao Paulo.\nSegunda linha do documento.\n' > ata.txt
soffice --headless --convert-to docx ata.txt >/dev/null 2>&1
soffice --headless --convert-to 'doc:MS Word 97' ata.txt >/dev/null 2>&1
soffice --headless --convert-to pdf ata.docx >/dev/null 2>&1
ls -la "$D"
