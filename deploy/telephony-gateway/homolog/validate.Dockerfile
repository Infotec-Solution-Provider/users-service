# Disposable OS/package validation; never connects to a PBX.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    kamailio kamailio-extra-modules kamailio-utils-modules kamailio-websocket-modules \
    rtpengine-daemon python3 ca-certificates curl shellcheck \
    && rm -rf /var/lib/apt/lists/*
COPY . /source
RUN bash -n /source/homolog/install-root.sh \
    && shellcheck /source/homolog/install-root.sh
CMD ["bash", "/source/homolog/validate.sh"]
