# Refresh pelo proxy de serviços

`AUTH_COOKIE_PATH` aceita apenas `/api/auth` (padrão atual) ou
`/_svc/users/api/auth` (URL externa publicada pelo proxy Next). O serviço valida a
opção na inicialização e usa o mesmo caminho ao gravar, renovar e apagar o cookie.
Não é necessário mudar o frontend nem ampliar o cookie para `/`.

No homolog com `NEXT_PUBLIC_USERS_URL` publicado em `/_svc/users`, configurar
`AUTH_COOKIE_PATH=/_svc/users/api/auth` no processo homolog-users. Preservar as
demais configurações e o caminho padrão dos outros ambientes. Após publicar a
correção, efetuar novo login: o cookie anterior em `/api/auth` não é enviado ao
prefixo do proxy. O cookie novo continua HttpOnly, SameSite=Lax e com a política
Secure já existente.

Diagnóstico: o login retorna um access token que permanece em memória. Após
navegação completa, o bootstrap precisa renovar a sessão pelo cookie. A regra
de caminho do navegador impede que um cookie em `/api/auth` seja enviado para
`/_svc/users/api/auth/refresh`; o serviço recebe a requisição sem refresh token e
responde 401. `AuthService.refresh` consulta o operador diretamente e não depende
da representação pública sem senhas de `GET /users/:id`.
