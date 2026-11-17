# Odim production gateway — 2026-11-17

This is an isolated pilot for Odim operator 534, extension 2710. Existing WhatsApp operation remains available to operators outside the pilot. The gateway does not provision extensions or change the customer's Asterisk configuration.

## Published topology

- Browser: `wss://lux.infotecrs.inf.br/telephony-gw`, permitted Origin `https://inpulse.infotecrs.inf.br`.
- Lux: Kamailio SIP/UDP `144.91.87.0:5060`, WS loopback `127.0.0.1:7171`, RTPEngine control loopback `127.0.0.1:7224`, audio UDP `24000–24199`.
- Customer PBX: `131.161.3.106:5060`, reported Asterisk 1.8.11.0, customer audio range `10000–20000`.
- Users callback: `https://inpulse.infotecrs.inf.br/api/telephony/gateway/authorize`. Both the API key and JWT are sent in headers. Query-string credentials are not accepted by this callback. Gateway access logs are disabled because the browser handshake carries a short-lived query token.

Kamailio's http_client 5.7 default peer verification is enabled and hostname verification is 2; no insecure TLS override is installed. See the official [http_client documentation](https://www.kamailio.org/docs/modules/5.7.x/modules/http_client.html#http_client.p.verify_peer).

## Controls and validation

Hostinger controls: `/home/inpulse/odim-telephony-gateway-20261117`. Lux root controls: `/root/inpulse-odim-telephony-20261117`. These contain private configuration and backups; do not publish their private subdirectories or dump rendered gateway definitions.

`users-deploy.cjs` owns exactly four compiled JS files and the new private JSON. Its guards preserve other JS files, package files, rollout profile and environment file metadata. `configure-odim.cjs` uses the application service for a fixed Odim setting, records the previous value and reads back writes. Actor 0 denotes system deployment. The CLI offers no arbitrary SQL interface.

`verify-public.cjs` runs on Hostinger. It verifies real TLS and five public WebSocket authorization outcomes, then destroys the upgraded socket without sending SIP messages. It asserts the phone allowlist and existing WhatsApp compatibility. The result is written once to `public-verification.json`; do not rerun while that receipt exists. Do not delete a receipt merely to repeat a test.

Published validation: authorized operator 534 receives HTTP 101; missing token, foreign Origin, invalid signature and operator 535 receive 403. Tenant setting readback confirms enabled/gateway/`131.161.3.106:5060`. SIP/UDP OPTIONS previously received an Asterisk response from both VPSs. No REGISTER, INVITE, call or media test was performed by deployment.

## Operational handoff

Charles must refresh the application and use the manual **Conectar** action. Coordinate this with the current phone first: registering extension 2710 may replace its existing registration. Then check registration, an authorized outbound test call, inbound ringing, audio in both directions and hangup. Signaling connectivity and an authorized WebSocket alone do not validate audio or SIP credentials. Do not automate this test with live credentials.

The customer firewall/Fail2Ban must permit SIP from Lux `144.91.87.0`; the customer PBX's reported audio range is separate from the gateway range. Existing UDP OPTIONS connectivity does not prove the customer's full media path or a permanent allowlist.

## Recovery

Inspect receipts first and use the owned rollback commands only while their concurrency guards still match. Do not overwrite a concurrent release.

1. Restore the Odim singleton using `configure-odim.cjs rollback`, from the live users-service directory with production Node 22. This disables our setting before removing the gateway module.
2. Restore the users overlay with `users-deploy.cjs rollback` using production Node 22. It restarts only users-service and verifies its health. The release's shared deployment lock must be held, as for installation.
3. As root on Lux, `python3 /root/inpulse-odim-telephony-20261117/lux-deploy.py rollback` stops only the new gateway units and restores its Nginx changes. Coordinate active calls first.
4. The Hostinger public prefix route may remain harmlessly installed for the users API; its independent root-owned guarded rollback is `/home/inpulse/odim-telephony-gateway-20261117/install-public-route.py rollback`, with backup under `/var/lib/inpulse-odim-telephony-route-20261117`.

No other PM2 service should be restarted. Do not restore historical rollout files: that could reintroduce the former WhatsApp restriction.
