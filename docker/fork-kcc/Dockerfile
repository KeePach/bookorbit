# KCC for BookOrbit (fork): KCC's own image plus a small HTTP front (server.py).
# Update KCC by changing KCC_TAG and rebuilding: docker compose build kcc
ARG KCC_TAG=v13.0.4
FROM ghcr.io/ciromattia/kcc:${KCC_TAG}

# KCC's image only has p7zip-full, which Debian builds without RAR support. bsdtar (libarchive)
# lets KCC open CBR files; KCC tries it before 7z.
RUN apt-get update -y && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libarchive-tools && \
    rm -rf /var/lib/apt/lists/*

ENV PYTHONPATH=/opt/kcc

COPY shim/PySide6 /opt/fork-kcc/shim/PySide6
COPY server.py /opt/fork-kcc/server.py

# KCC's converter imports PySide6 for GUI translations, but the image does not install it (true
# for v13.0.0 to v13.0.4). The stand-in is only used when the real module is missing.
RUN python -c "import PySide6.QtCore" 2>/dev/null || \
    cp -r /opt/fork-kcc/shim/PySide6 "$(python -c 'import site; print(site.getsitepackages()[0])')/" && \
    python -c "from kindlecomicconverter import comic2ebook" && \
    python -c "import sys; sys.argv=['x']; sys.path.insert(0, '/opt/fork-kcc'); import server; print(len(server.option_schema()['groups']), 'option groups')"

ENV KCC_WORK_DIR=/work HOME=/tmp PORT=8090
EXPOSE 8090
ENTRYPOINT ["python", "/opt/fork-kcc/server.py"]
