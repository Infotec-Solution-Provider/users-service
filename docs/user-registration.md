# Cadastro de usuários CRM

Rotas ADMIN derivam tenant e ator da sessão: `/api/crm/user-registration/schema`, `GET /:id`, `POST` e `PATCH /:id`. Respostas `data: {record, version, fields}` usam labels em português e opções do schema real, incluindo disponibilidade de EXTERNO. `record` nunca contém SENHA; senha é somente escrita.

POST exige NOME, LOGIN, SENHA e NIVEL. O código manual do legado é alocado em um único INSERT SELECT com PK; não há consulta MAX separada, retry automático ou reutilização de uma resposta incerta. Releitura usa LOGIN único. Defaults de data zero nullable são enviados como NULL e CODIGO_ERP vazio como NULL, sem alterar SQL mode. Concorrência com escritores legados pode produzir conflito/UNKNOWN; o cliente precisa conferir antes de nova tentativa.

PATCH recebe `{changes, version}`. A versão é HMAC opaco do snapshot completo, incluindo a senha oculta, vinculado ao tenant e a uma chave aleatória do processo. Reinício invalida versões abertas e exige releitura. O serviço relê o snapshot, compara a versão e usa CAS completo/null-safe/binário convertido a UTF8, preservando comparação exata mesmo com coluna Latin1. Senha vazia não significa manter: a UI deve omitir SENHA ao editar se não desejar alterá-la.

Expediente e grupos usam comandos próprios dos catálogos. Senha, perfil e ativo revogam sessões de refresh após alteração; falha dessa confirmação retorna UNKNOWN e exige releitura. SIP mantém suas rotas próprias. As listagens e detalhes genéricos de usuários também removem campos de segredo da resposta. POST legado retorna o registro criado em vez de undefined. Metas permanecem sem alteração.
