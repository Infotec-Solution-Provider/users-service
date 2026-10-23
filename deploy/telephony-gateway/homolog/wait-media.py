#!/usr/bin/env python3
"""Wait for rtpengine control readiness before starting SIP routing."""
import socket
import time

for attempt in range(20):
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(0.5)
        try:
            sock.sendto(b'ready d7:command4:pinge', ('127.0.0.1', 7223))
            if b'pong' in sock.recv(4096):
                raise SystemExit(0)
        except OSError:
            pass
    time.sleep(0.5)
raise SystemExit('rtpengine control is not ready on loopback UDP 7223')
