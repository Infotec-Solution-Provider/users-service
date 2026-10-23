# Gateway compartilhado da homologação

Instalação nativa no Ubuntu 24.04 do servidor `inpulse-prod`, isolada em serviços
`homolog-telephony-*`. Usa os pacotes da distribuição; o backend já publicado na
branch `homolog` inclui o protocolo de autorização. Não altera o código da produção.

| Item | Configuração |
|---|---|
| WSS público | `wss://inpulse.infotecrs.inf.br/homolog/telephony-gw` |
| Origem permitida | `https://inpulse.infotecrs.inf.br` |
| WebSocket interno | `127.0.0.1:7170/TCP` |
| Autorização | `http://127.0.0.1:7101/api/telephony/gateway/authorize` |
| SIP privado | `172.22.125.232:5060/UDP` |
| Controle rtpengine | `127.0.0.1:7223/UDP` |
| Mídia | `32000–32999/UDP`, interfaces pública e ZeroTier |
| Redes de centrais permitidas | `172.22.0.0/16` |
| Configuração | `/etc/homolog-telephony` |
| Backup/logs da instalação | `/var/lib/homolog-telephony-install` (root, 0700) |

## Instalar

Requer administrador para instalar pacotes, criar serviços, liberar a faixa UDP e
adicionar **somente** a rota exata da homologação no vhost HTTPS compartilhado.
O nginx é validado antes e depois da mudança; seu reload é gracioso.
O único processo PM2 reiniciado é `homolog-users`.

Revise os scripts e execute o instalador com `sudo` no servidor:

```bash
sudo bash /caminho/do/pacote/homolog/install-root.sh install
```

Se o vhost tiver outro nome, passe o caminho como segundo argumento. O instalador
recusa selecionar ambiguamente um server HTTPS. Não execute com `bash -x`: a
geração de chaves deve permanecer fora dos logs. Chaves novas são geradas no próprio
servidor e nunca fazem parte do pacote. As demais configurações de `users-service`
são preservadas. As unidades padrão dos pacotes ficam mascaradas, para não iniciar
um proxy SIP padrão nas interfaces públicas.

Se a atualização/instalação de pacotes for interrompida, o instalador mostra as
últimas linhas do erro. Para retomar **somente antes da configuração/ativação**:

```bash
sudo bash /caminho/do/pacote/homolog/install-root.sh resume
```

Esse modo preserva os backups e logs originais e recusa prosseguir se o `.env`
ou vhost tiver mudado, se as chaves já tiverem sido criadas ou se a ativação das
unidades tiver começado. Não apague o diretório de estado para repetir `install`.

Após instalar, os administradores dos tenants de homologação podem selecionar o
gateway na configuração SIP. Nenhum tenant nem ramal é modificado pelo instalador.
Um mesmo gateway atende várias centrais e vários tenants; a conexão é vinculada ao
ramal e à central autorizada pelo backend. A central deve alcançar o IP ZeroTier
do gateway. Para G.711, precisa aceitar `ulaw` ou `alaw`.

## Verificar

```bash
sudo systemctl status homolog-telephony-kamailio homolog-telephony-rtpengine --no-pager
sudo journalctl -u homolog-telephony-kamailio -u homolog-telephony-rtpengine -n 60 --no-pager
sudo nginx -t
```

Confira o WSS sem token: deve recusar com 403, não aceitar o upgrade. Depois,
valide um tenant de teste: configuração disponível, registro SIP, chamada interna,
externa, recebimento, áudio nos dois sentidos, desligamento dos dois lados, DTMF,
espera/retomada e renovação do registro. Não registre um ramal que esteja em uso
em outro aparelho: `chan_sip` normalmente guarda um único registro por ramal.

Os testes de pacote em container cobrem sintaxe, inicialização sem root, controle
de mídia NG, handshake autorizado, REGISTER/retorno SIP com central simulada,
recusa de outro ramal/destino e limites de edição/rollback. Não substituem
uma ligação real no servidor, nem demonstram capacidade concorrente. Redes do
cliente que bloqueiam UDP podem exigir TURN, que não é instalado neste pacote.

## Rollback

```bash
sudo bash /caminho/do/pacote/homolog/install-root.sh rollback
```

Encerra chamadas que estiverem no gateway, desativa apenas as novas unidades,
restaura somente as quatro variáveis do gateway em `homolog-users`, reinicia esse
processo e remove as novas regras de firewall. Restaura o vhost se ele não tiver
sido editado por outra pessoa desde a instalação. Havendo edição concorrente,
interrompe a restauração do nginx e pede a remoção apenas do include do gateway.
Pacotes, unidades, configurações e backups ficam preservados para auditoria.

## Validação isolada

Na pasta `deploy/telephony-gateway`, sem apontar para nenhuma central:

```bash
docker build -f homolog/validate.Dockerfile -t inpulse-homolog-telephony-validation .
docker run --rm inpulse-homolog-telephony-validation
```
