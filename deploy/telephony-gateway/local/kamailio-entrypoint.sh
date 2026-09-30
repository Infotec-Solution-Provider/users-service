#!/bin/sh
# Renders /etc/kamailio/gateway-defs.cfg from the container environment, checks the config, starts Kamailio.
set -eu
for name in GW_WS_ADDR GW_SIP_LISTEN GW_SIP_ADVERTISE GW_USERS_URL GW_API_KEY GW_ORIGIN GW_RTPENGINE; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then echo "variável $name não definida (veja local/.env.example)" >&2; exit 1; fi
  case "$value" in *'!'*) echo "variável $name não pode conter '!'" >&2; exit 1;; esac
done
cat > /etc/kamailio/gateway-defs.cfg <<DEFS
#!substdef "!GW_WS_ADDR!${GW_WS_ADDR}!g"
#!substdef "!GW_SIP_LISTEN!${GW_SIP_LISTEN}!g"
#!substdef "!GW_SIP_ADVERTISE!${GW_SIP_ADVERTISE}!g"
#!substdef "!GW_USERS_URL!${GW_USERS_URL}!g"
#!substdef "!GW_API_KEY!${GW_API_KEY}!g"
#!substdef "!GW_ORIGIN!${GW_ORIGIN}!g"
#!substdef "!GW_RTPENGINE!${GW_RTPENGINE}!g"
#!substdef "!GW_MEDIA_FROM_BROWSER!${GW_MEDIA_FROM_BROWSER:-}!g"
#!substdef "!GW_MEDIA_FROM_PBX!${GW_MEDIA_FROM_PBX:-}!g"
DEFS
chmod 600 /etc/kamailio/gateway-defs.cfg
kamailio -c -f /etc/kamailio/kamailio.cfg
exec kamailio -DD -E -f /etc/kamailio/kamailio.cfg
