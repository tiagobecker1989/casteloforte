# Vincular a conta Sicredi (Pix recebidos)

## O que o sistema consegue ver
- **Pix recebidos**: direto na conta, pela **API Pix do Sicredi** (botão "Buscar Pix recebidos" em *Conciliação Pix*; também roda sozinho no agendamento diário).
- **Pix enviados e demais saídas**: a API Pix do Sicredi não os informa (segundo o Guia Técnico oficial, ela trata de cobranças e Pix recebidos).
  Para ver também as **saídas**, exporte o extrato no Internet Banking (OFX ou CSV) e use **Importar extrato** na mesma tela.

## O que a paróquia precisa providenciar com o Sicredi
Conforme o *Guia Técnico de Integrações API Pix Sicredi* (consulte a versão atual no site do Sicredi, pois processos mudam):
1. Conta **pessoa jurídica** (CNPJ) da paróquia no Sicredi, com chave Pix.
2. Pedir à cooperativa a **adesão à API Pix** (termo de adesão) e o acesso ao Portal do Desenvolvedor.
3. No portal: gerar o certificado digital (a partir de um pedido CSR) e obter o **Client ID** e o **Client Secret**.
4. Guardar o **certificado** e a **chave privada** (sem senha), em formato **PEM**. Se o certificado vier em formato binário (DER), converta, por exemplo:
   `openssl x509 -inform DER -in certificado.cer -out certificado.pem`
5. Confirmar que o escopo de **consulta de Pix recebidos (`pix.read`)** está liberado na adesão.

## Como vincular no sistema
1. Peça ao servidor para ter a variável `SECRETS_KEY` (`openssl rand -base64 32`). Sem ela o sistema **recusa** guardar credenciais.
2. *Conciliação Pix → Vincular conta Sicredi*: informe Client ID, Client Secret e envie os arquivos do certificado e da chave (e a cadeia de certificados do Sicredi, se o banco exigir).
3. As credenciais ficam **criptografadas (AES-256-GCM)** no banco; o sistema mostra apenas até quando o certificado é válido. Renove-o antes do vencimento.

## Pontos que só o ambiente real do Sicredi confirma
Esta integração foi escrita conforme o guia oficial e a especificação do Pix do Banco Central e testada contra um **simulador** (`scripts/fake-sicredi.mjs`), não contra o Sicredi de verdade:
- o nome do pagador pode não vir nas respostas (então a sugestão automática de membro não aparece e a conciliação é manual);
- o escopo, a URL e o formato do certificado dependem da adesão da paróquia.
Se algo falhar, a tela mostra a mensagem do Sicredi traduzida; envie-me essa mensagem para ajustar.
