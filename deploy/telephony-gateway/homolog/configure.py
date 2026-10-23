#!/usr/bin/env python3
"""Render the isolated homolog gateway; never print credentials."""
import argparse
import os
from pathlib import Path
import re
import stat
import tempfile

KEYS = (
    "TELEPHONY_GATEWAY_WSS_URL", "TELEPHONY_GATEWAY_TOKEN_SECRET",
    "TELEPHONY_GATEWAY_API_KEY", "TELEPHONY_GATEWAY_ALLOWED_NETWORKS",
)
ORIGIN = "https://homolog.infotecrs.inf.br"


def replace_file(path, content):
    path = Path(path).resolve(strict=True)
    info = path.stat()
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".gateway-")
    try:
        with os.fdopen(fd, "w") as out:
            out.write(content)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(tmp, stat.S_IMODE(info.st_mode))
        os.chown(tmp, info.st_uid, info.st_gid)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def gateway_lines(text):
    return [line for line in text.splitlines(keepends=True)
            if any(re.match(r"^\s*(?:export\s+)?" + key + r"\s*=", line) for key in KEYS)]


def patch_env(target, source):
    original = Path(target).read_text()
    # Restore only these four keys, preserving unrelated later environment edits.
    old = set(gateway_lines(original))
    remaining = "".join(line for line in original.splitlines(keepends=True) if line not in old)
    replacement = "".join(gateway_lines(Path(source).read_text()))
    replace_file(target, remaining.rstrip("\n") + "\n" + replacement)


def braces(text):
    """Find nginx blocks without treating quoted braces/comments as syntax."""
    stack, blocks = [], []
    quote, escaped, comment = None, False, False
    for i, char in enumerate(text):
        if comment:
            if char == "\n":
                comment = False
            continue
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = None
            continue
        if char in "\"'":
            quote = char
        elif char == "#":
            comment = True
        elif char == "{":
            stack.append(i)
        elif char == "}":
            if not stack:
                raise ValueError("Unbalanced nginx config")
            start = stack.pop()
            blocks.append((start, i, len(stack)))
    if stack or quote:
        raise ValueError("Unbalanced nginx config")
    return blocks


def patch_nginx(target, snippet):
    text = Path(target).read_text()
    marker = "include " + snippet + ";"
    if marker in text:
        raise ValueError("Gateway already included; refusing a second installation")
    candidates = []
    for start, end, depth in braces(text):
        if depth != 0 or not re.search(r"\bserver\s*$", text[:start]):
            continue
        block = text[start:end]
        names = re.findall(r"(?m)^\s*server_name\s+([^;]+);", block)
        if not any("homolog.infotecrs.inf.br" in line.split() for line in names):
            continue
        if not re.search(r"(?m)^\s*listen\s+[^;]*\b443\b[^;]*;", block):
            continue
        candidates.append(end)
    if len(candidates) != 1:
        raise ValueError("Expected exactly one public HTTPS server for homolog.infotecrs.inf.br")
    end = candidates[0]
    replace_file(target, text[:end] + "  " + marker + "\n" + text[end:])


def render(template, output, secrets, public, private):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    values = dict(line.strip().split("=", 1) for line in Path(secrets).read_text().splitlines() if "=" in line)
    api_key = values["TELEPHONY_GATEWAY_API_KEY"]
    if not re.fullmatch(r"[0-9a-f]{64}", api_key):
        raise ValueError("Invalid gateway key")
    definitions = {
        "GW_WS_ADDR": "127.0.0.1:7170",
        "GW_SIP_LISTEN": private + ":5060",
        "GW_SIP_ADVERTISE": private + ":5060",
        "GW_USERS_URL": "http://127.0.0.1:7101",
        "GW_API_KEY": api_key, "GW_ORIGIN": ORIGIN,
        "GW_RTPENGINE": "udp:127.0.0.1:7223",
        "GW_MEDIA_FROM_BROWSER": "direction=pub direction=zt",
        "GW_MEDIA_FROM_PBX": "direction=zt direction=pub",
    }
    (output / "gateway-defs.cfg").write_text("".join(
        '#!substdef "!' + name + "!" + value + '!g"\n' for name, value in definitions.items()))
    config = Path(template).read_text().replace(
        '/etc/kamailio/gateway-defs.cfg', str(output / "gateway-defs.cfg"))
    config = config.replace('loadmodule "ctl.so"',
        'loadmodule "ctl.so"\nmodparam("ctl", "binrpc", "unix:/run/homolog-telephony-kamailio/ctl")')
    (output / "kamailio.cfg").write_text(config)
    (output / "rtpengine.conf").write_text(
        "[rtpengine]\ninterface = pub/" + public + ";zt/" + private + "\n"
        "listen-ng = 127.0.0.1:7223\nport-min = 32000\nport-max = 32999\n"
        "table = -1\ntimeout = 60\nsilent-timeout = 3600\ntos = 184\nlog-level = 5\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["render", "nginx", "env"])
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args()
    {"render": render, "nginx": patch_nginx, "env": patch_env}[args.mode](*args.paths)
