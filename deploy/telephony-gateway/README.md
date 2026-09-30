# Gateway de telefonia web (WebRTC → SIP)

Permite usar a telefonia pelo navegador com centrais que não suportam WebRTC, como o Asterisk 1.8 (`chan_sip`, só UDP). É opcional, por tenant: na tela **Configuração global de SIP → Telefonia web**, o administrador escolhe **Via gateway in.pulse** e informa o IP da central.

> **Estado:** implementado em 30/09/2026, **ainda não testado com uma central**. Os arquivos `kamailio.cfg` e `rtpengine.conf` são modelos a validar com a lista do final deste documento.

```
navegador (JsSIP) ──wss──▶ nginx (TLS) ──ws──▶ Kamailio ──SIP/UDP (ZeroTier)──▶ central
navegador ◀──DTLS-SRTP/ICE──▶ rtpengine ◀──RTP comum (ZeroTier)──▶ central
```

- **O código do navegador não muda.** O users-service entrega ao navegador o endereço do gateway (com um token) e usa o IP da central como domínio SIP. O navegador registra o ramal com o login e a senha do `operadores_config_sip`, como no modo direto.
- **A central não muda.** O Kamailio não é registrador: repassa REGISTER e INVITE para a central, que autentica o ramal. O Contact do navegador é reescrito para o endereço do gateway, então a central devolve as chamadas do ramal ao gateway sem precisar de WebSocket, Path ou `nat=yes`.
- **Sem conversão de áudio.** Navegador e central negociam G.711 (`ulaw`/`alaw`); o rtpengine só troca a camada (criptografia, ICE, rtcp-mux).

## Segurança

- O WebSocket só abre com um token emitido pelo users-service para um operador logado (`GET /api/telephony/webrtc-config`), assinado com `TELEPHONY_GATEWAY_TOKEN_SECRET` e válido por 12 h por padrão.
- No handshake, o Kamailio consulta `GET /api/telephony/gateway/authorize` (header `X-Telephony-Gateway-Key`). O users-service confere o token **e a configuração atual do tenant**: tenant desabilitado, modo trocado ou central alterada invalidam tokens antigos. A resposta `ramal:ip:porta` prende a conexão a um ramal e a uma central.
- Toda requisição na conexão precisa usar esse ramal no From e essa central no destino. Só REGISTER e INVITE iniciam diálogos.
- A central só pode estar nas redes de `TELEPHONY_GATEWAY_ALLOWED_NETWORKS` (conferido ao salvar, ao emitir o token e ao autorizar), então o gateway não vira ponte para qualquer servidor SIP.
- Chamadas vindas da central só são aceitas se o Contact reescrito existir e a origem for a central daquela conexão.
- O Kamailio escuta SIP apenas no endereço ZeroTier. O nginx limita handshakes por IP e não registra o token em log.

## Requisitos

- Servidor Linux com IP público (ou NAT com encaminhamento da faixa UDP de mídia) e ZeroTier na mesma rede das centrais. Pode ser o servidor do in.pulse ou uma máquina separada (recomendado, para que problemas de telefonia não afetem o sistema).
- nginx servindo o domínio do in.pulse em HTTPS (o certificado atual serve para o WSS).
- Kamailio 5.8 com os módulos `websocket`, `xhttp`, `http_client`, `htable`, `nathelper`, `rtpengine`, `tm`, `rr`, `textops`, `siputils`, `corex`, `sanity`. Nos pacotes Debian do projeto (deb.kamailio.org) eles ficam divididos entre `kamailio` e pacotes de módulos extras; confira com `kamailio -I` / `apt-cache search kamailio` antes de instalar.
- rtpengine (pacote `rtpengine-daemon` no Debian 12 ou o repositório oficial do projeto).
- Firewall: liberar a faixa UDP de mídia (`port-min`–`port-max`) na interface pública; a porta 5060/UDP fica só no ZeroTier; 8090/TCP só em 127.0.0.1.

## Configuração

1. **users-service** (`.env`, ver `.env.example`):
   - `TELEPHONY_GATEWAY_WSS_URL=wss://<domínio>/telephony-gw`
   - `TELEPHONY_GATEWAY_TOKEN_SECRET` e `TELEPHONY_GATEWAY_API_KEY`: dois valores aleatórios diferentes, com 32 caracteres ou mais (por exemplo `openssl rand -base64 48`).
   - `TELEPHONY_GATEWAY_ALLOWED_NETWORKS=172.22.0.0/16` (rede ZeroTier das centrais).
   - Sem todas essas variáveis, o modo gateway fica indisponível na tela.
2. **kamailio.cfg** — substitua as linhas `#!substdef` do início:
   - `GW_WS_ADDR`: onde o nginx entrega o WebSocket (padrão `127.0.0.1:8090`).
   - `GW_SIP_ADDR`: IP ZeroTier deste servidor e porta 5060.
   - `GW_USERS_URL`: URL interna do users-service.
   - `GW_API_KEY`: o mesmo valor de `TELEPHONY_GATEWAY_API_KEY`.
   - `GW_ORIGIN`: origem do frontend (`https://inpulse.infotecrs.inf.br`).
   - `GW_RTPENGINE`: socket de controle do rtpengine (`listen-ng`).
3. **rtpengine.conf** — `interface = pub/<IP público>;zt/<IP ZeroTier>` (se o IP público não estiver na interface, use `pub/<IP local>!<IP público>`), e a faixa de portas liberada no firewall.
4. **nginx** — inclua `nginx-location.conf` no bloco HTTPS do domínio e o `limit_req_zone` no bloco `http`.
5. **Tela SIP** (administrador do tenant): habilitar, escolher **Via gateway in.pulse**, informar o IP da central (porta 5060 é o padrão) e salvar.
6. **Usuários → Configurar SIP**: ramal, login e senha iguais aos da central (`sip.conf`/`sip_ramais.conf`).

Na central: o ramal precisa existir com `allow=ulaw` ou `alaw` e **não pode estar registrado ao mesmo tempo em um telefone de mesa** (o `chan_sip` guarda um único registro por ramal; as chamadas recebidas iriam para o último que registrou).

## Validação (quando for testar)

Use um ramal de teste que não esteja em filas nem em uso. Na central `infotec-tel` (172.22.75.124), o ramal definido pela equipe para os testes de compatibilidade com o Asterisk 1.8 é o **`2010`** (fora das filas, sem conversas nos últimos 30 dias em 30/09/2026). Alternativas: `4003` e `4005` ("Testes in.Pulse").

O 2010 costuma estar registrado num Zoiper (192.168.15.102). Feche o Zoiper durante o teste pelo navegador: o `chan_sip` guarda um único registro por ramal, e o Zoiper retomaria o registro na renovação seguinte, desviando as chamadas recebidas. No perfil do ramal (contexto `1`), chamadas externas recentes foram recusadas com `no-rights`; comece por chamadas internas e confira o formato de discagem externa antes de testá-la.

1. `kamailio -c -f kamailio.cfg` (sintaxe) e `rtpengine --config-file=... --foreground` sem erros.
2. Conectar a telefonia no navegador; no Kamailio, log `conn N bound to 4003:172.22.75.124:5060`; na central, `sip show peers` com o ramal registrado a partir do IP ZeroTier do gateway. Se o REGISTER receber `403 Not Authorized`, o `$conid` do handshake não é o mesmo das mensagens SIP (a documentação não garante isso; pelo código-fonte deveria ser).
3. Ligar do navegador para outro ramal e para o número de eco da central, se existir; conferir áudio nos dois sentidos, mudo e desligar dos dois lados.
4. Ligar de outro ramal para o ramal web; atender no navegador.
5. DTMF: o JsSIP envia SIP INFO; conferir se a central reconhece (URA ou `core set verbose 5`). Se não reconhecer, avaliar RFC 2833 no JsSIP.
6. Espera/retomada pela central (re-INVITE) e `qualify` (OPTIONS) mantendo o ramal `OK`.
7. Tentativas de abuso devem falhar: WebSocket sem token, token de outro ramal no From, INVITE para outra central, INVITE da central sem `gwc` válido.
8. Rede do cliente sem UDP: se o áudio não passar, configurar um TURN na tela.

## Limites conhecidos

- Reiniciar o Kamailio ou o rtpengine derruba as ligações em andamento; as implantações do in.pulse não afetam o gateway.
- Um processo Kamailio guarda as ligações WebSocket↔ramal em memória; para mais de um servidor de gateway seria preciso compartilhar o `htable`.
- Não há gravação, transferência nem conferência no gateway; a gravação da central continua valendo.
