# CRM de usuários: grupos, expedientes, motivos de pausa e vendas legadas

As rotas `/api/crm/*` abaixo exigem sessão válida e papel ADMIN, derivam a instância exclusivamente da sessão e enviam `Cache-Control: no-store`. Não modificam metas, permissões por grupo, execução de pausas, presença ou regras de autenticação.

## Contrato comum

`GET /crm/{user-groups|shifts|pause-reasons}` aceita `page`, `perPage` (1 a 100), `CODIGO`, `DESCRICAO`, `sortBy` e `sortDirection=asc|desc`, retorna `{data,page:{current,totalRows}}`. Busca textual é literal, com `%`, `_` e `!` escapados. `GET /:id` retorna `{data}`.

`POST` recebe `CODIGO` inteiro positivo informado pelo administrador e campos editáveis; não usa MAX+1. Descrição é obrigatória e não vazia. `PATCH /:id` recebe `{changes,expected}` com campos alterados e snapshot completo dos campos editáveis, sem CODIGO. `DELETE /:id` recebe `{expected}`. PATCH distingue omissão, null e zero. Códigos históricos, inclusive zero/negativos, permanecem acessíveis para manutenção.

| Rota | Tabela/campos editáveis | Referência que impede exclusão |
|---|---|---|
| user-groups | grupos_operador: DESCRICAO (35, nullable) | gruposxoperadores.GRUPO |
| shifts | horarios: DESCRICAO (50, nullable), HORARIO_1/2/3 (SIM/NAO/null), ENTRADA_1/2/3 e SAIDA_1/2/3 (TIME/null) | operadores.HORARIO |
| pause-reasons | motivos_pausa: DESCRICAO (50, nullable), TEMPO_MAX_SEG (inteiro >=0/null), PRODUTIVIDADE (SIM/NAO/null) | pausas_realizadas.COD_PAUSA |

As descrições novas aceitam caracteres imprimíveis Latin1; não representam silenciosamente euros, emoji ou outros caracteres fora desse conjunto. Snapshots preservam strings históricas, inclusive controles antigos. Valores TIME históricos até ±838:59:59 permanecem no snapshot; novos valores de relógio usam HH:mm:ss de 00:00:00 a 23:59:59. Faixas noturnas/sobrepostas são preservadas sem impor uma política operacional não demonstrada. O cadastro tem três faixas, sem dia da semana/fuso/vigência. Flags desabilitadas não apagam seus horários.

## Grupos e associação de expediente

`GET /crm/user-groups/:id/members` retorna `{data:[{CODIGO,GRUPO,OPERADOR,OPERADOR_NOME,OPERADOR_ATIVO}]}`. `POST` recebe `{CODIGO,OPERADOR}` com códigos positivos explícitos. A inclusão exige grupo e operador existentes e evita par já associado. `DELETE /crm/user-groups/:groupId/members/:id` recebe `{expected:{OPERADOR}}`, inclusive null para referências históricas. Não altera setores, grupos de clientes ou privilégios de acesso.

`PATCH /crm/users/:id/shift` recebe `{HORARIO:numeroPositivo|null,expected:{HORARIO:numero|null}}` e retorna `{data:{CODIGO,HORARIO}}`. Null limpa a associação; zero histórico é preservado no snapshot e não criado como referência nova. A existência do expediente participa da mesma instrução UPDATE. O endpoint genérico de usuários não aceita alterar HORARIO, CODIGO ou chaves SQL; após cadastro inicial, o expediente é associado por essa operação específica.

## Vendas legadas

`GET /crm/sales-types` aceita page/perPage/ID/NOME e retorna o envelope comum. Cada linha inclui ID_COUNT, número de registros que compartilham o ID conforme a collation do CRM. O nome de tela recomendado é “Vendas — Cadastro legado”; PAGAMENTO é um decimal sem unidade presumida, sem moeda, percentual ou cálculo de remuneração.

`GET /crm/sales-types/:id` retorna registro apenas se o ID identifica uma linha. `POST` recebe `{ID:string<=4,NOME:string<=30,PAGAMENTO:stringDecimal}`. Preserva zeros do ID e aceita decimal exato entre -99.99 e 99.99. `PATCH /:id` recebe `{changes:{NOME?,PAGAMENTO?},expected:{ID,NOME,PAGAMENTO}}`; ID é imutável. `DELETE /:id` recebe `{expected:{ID,NOME,PAGAMENTO}}`. IDs duplicados bloqueiam edição/exclusão. Não migra nem impõe chave única a dados legados. Todas as mutações por snapshot atingem no máximo uma linha (`LIMIT 1`). `compras` continua sendo a fonte das vendas transacionais, em outro domínio; não há associação inventada com operadores.

## Concorrência e confirmação

Cada SQL usa `/query-once`, uma tentativa, sem retry/fallback/redirect de escrita. PATCH compara snapshot completo atomicamente, com normalização UTF8mb4 nos dois lados antes da comparação binária; isso preserva acentos com conexões Latin1 e UTF8mb4 sobre colunas Latin1. DELETE verifica referências existentes na mesma instrução. Código PK duplicado e alterações concorrentes retornam 409; falha de transporte retorna 503 com `outcome:UNKNOWN`. A interface precisa bloquear novas gravações até recarregar uma leitura confirmada. Não repetir automaticamente uma operação ambígua.

As tabelas legadas não possuem FKs para esses vínculos; NOT EXISTS protege referências visíveis na instrução, sem prometer integridade universal contra processos desktop que criem referências depois da exclusão. Adições de membros e gravações do catálogo vendas são serializadas neste processo para evitar duplicidade entre requisições web concorrentes. Sem unique no par/ID, outros processos/escritores legados ainda podem introduzir duplicidade. Não há limpeza automática de órfãos ou duplicados.

Logs `crm_catalog_write` registram instância, ator, operação, identidade e nomes dos campos, sem valores pessoais, SQL ou segredos. São observações no stdout/PM2; não constituem trilha transacional durável com before/after.

## Validação local

`npm test` executa contratos, serviços, autenticação HTTP, transporte sem retry e regressões existentes. `npm run build` compila o serviço. A suíte opcional MySQL usa `CRM_USERS_MYSQL_PORT` e opcional `CRM_USERS_MYSQL_MODULE` (caminho para mysql2/promise), conexão root sem senha exclusivamente em MySQL de teste local 127.0.0.1. Cria dois schemas aleatórios Latin1, testa conexões Latin1 e UTF8mb4 e os remove ao finalizar. Não executar essa suíte em bancos reais.
