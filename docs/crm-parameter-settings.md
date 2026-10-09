# Parâmetros do CRM legado

A aba **Cadastros → Parâmetros → CRM** no frontend atual usa:

- `GET /api/crm/parameter-settings`: catálogo disponível, padrões confirmados no schema e valores atuais.
- `PATCH /api/crm/parameter-settings`: `{ changes: [{ key, value, previousValue }] }`.

As rotas exigem autenticação e `ADMIN`; a conexão CRM é resolvida pelo `instances-service` usando
exclusivamente `req.session.instance`. A tabela consultada é `parametros` do banco CRM desse tenant.
O registro editado é o primeiro por `CODIGO`, seguindo o contrato já usado na configuração global de SIP.

O catálogo fica em `src/parameters/crm-parameter-settings.catalog.ts`. Ele define nome, descrição, grupo,
tipo e codificação (`S/N` ou `SIM/NAO`). A API confirma a existência e o tipo de cada coluna usando
`information_schema.COLUMNS`, `TABLE_SCHEMA = DATABASE()` e `TABLE_NAME = 'parametros'` na conexão
do tenant. A tela exibe somente configurações suportadas e presentes naquele banco. O catálogo local
não é evidência de que uma coluna exista em todos os tenants.

`value: null` significa restaurar o padrão e gera `coluna = DEFAULT`, preservando defaults e nulabilidade
do schema. Desativar uma opção grava o código falso correspondente. Não se removem colunas nem registros.
Se a tabela estiver vazia, a API orienta configurar o registro no CRM legado, sem criar uma linha incompleta.
Credenciais SIP/AMI, SQL de ordenação e outras colunas fora do catálogo não são expostas nem modificadas.

Somente campos alterados entram em um único `UPDATE` atômico. Os identificadores vêm do catálogo;
os valores e `CODIGO` usam bindings. Cada valor anterior é comparado com `<=>` no `WHERE`, protegendo
também o intervalo entre leitura e gravação. Conflitos retornam HTTP 409 e não provocam retry automático.
Outras configurações, inclusive as da tela SIP, são preservadas. A aplicação legada pode precisar
recarregar suas configurações para observar alterações.

Validação local: `npx vitest run tests/crm-parameter-settings.test.ts` e `npx tsc --noEmit`.
Os testes usam doubles de conexão e não verificam disponibilidade ou comportamento do CRM em produção.
