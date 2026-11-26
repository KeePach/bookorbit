# KCC for BookOrbit (fork)

"Convert with KCC" on a comic's page runs [KCC](https://github.com/ciromattia/kcc) in its own
container, so BookOrbit's image stays as it is. This folder builds that container: KCC's official
image plus `server.py`, a small HTTP front that BookOrbit calls.

What the Dockerfile adds to KCC's image:

- The official 7-Zip as `7z` (`install-7zip.py`, checksum-pinned), so KCC can open CBR files. The
  image's `p7zip-full` is Debian's build without RAR support, and apt can't install anything else:
  Debian 11's security mirror returns 404 for its packages.
- A stand-in for `PySide6.QtCore`, only if the real one is missing. KCC 13.0.0 to 13.0.4 import it in
  the converter, but the Docker image doesn't install it, so `c2e` fails at startup without this.

## Compose

Add the service next to `app`, and two lines to `app`:

```yaml
services:
  app:
    environment:
      # ...existing variables...
      FORK_KCC_URL: http://kcc:8090
      # FORK_KCC_WORK_DIR defaults to /data/fork-kcc (inside ./data/app)
    volumes:
      # Converting writes into the manga folders, so they can't be mounted read-only (:ro).
      - ...

  kcc:
    container_name: bookorbit-kcc
    build: ./docker/fork-kcc
    # build args: KCC_TAG=v13.0.4 (change it and rebuild to update KCC)
    restart: unless-stopped
    init: true
    user: "${PUID:-1000}:${PGID:-1000}"
    expose:
      - "8090"
    volumes:
      # The same folder BookOrbit sees as /data/fork-kcc
      - ./data/app/fork-kcc:/work
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
```

Then `docker compose up -d --build app kcc`. Settings > Devices > KCC shows whether BookOrbit reaches it.

No port is published: only BookOrbit, on the compose network, can call it. It converts one book at a
time and only reads and writes inside its work folder.

## Library setup

- **Replace original** is offered only in libraries where BookOrbit may write files (Library settings >
  File updates) and for CBZ, CBR, CB7 and PDF books. A CBR or PDF becomes `Name.cbz`.
- **Keep original** writes `Name_kcc.cbz` next to the book. Add `*_kcc.cbz` to that library's
  Scanning > Skip files matching first, or the next scan turns each copy into its own book.
