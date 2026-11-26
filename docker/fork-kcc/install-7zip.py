"""Installs the official 7-Zip (static build) as /usr/local/bin/7z, ahead of the image's p7zip.

KCC opens archives with `7z` first. The image's p7zip-full is Debian's build without RAR support,
so CBR files fail there; the official 7-Zip reads RAR 4 and RAR 5. Downloading it directly also
avoids apt, whose Debian 11 (bullseye) security mirror no longer serves these packages.
"""

import hashlib
import io
import os
import platform
import tarfile
import urllib.request

VERSION = "26.06"
BUILDS = {
    "x86_64": ("x64", "2b539cf067b2ad48e1baa5093dbaa8818b73542d1222a0ffde9dc5f2922ea62e"),
    "aarch64": ("arm64", "edcc408aacce77da5223728f2eceb5e9f6dc713b8a9df934ad21e2a7f7560627"),
}

machine = platform.machine()
if machine not in BUILDS:
    raise SystemExit(f"No 7-Zip build for {machine}: CBR files will not open")
arch, expected = BUILDS[machine]
name = f"7z{VERSION.replace('.', '')}-linux-{arch}.tar.xz"
url = f"https://github.com/ip7z/7zip/releases/download/{VERSION}/{name}"

with urllib.request.urlopen(url, timeout=120) as response:
    data = response.read()
actual = hashlib.sha256(data).hexdigest()
if actual != expected:
    raise SystemExit(f"{name}: sha256 {actual}, expected {expected}")

with tarfile.open(fileobj=io.BytesIO(data), mode="r:xz") as archive:
    binary = archive.extractfile("7zzs").read()
target = "/usr/local/bin/7z"
with open(target, "wb") as out:
    out.write(binary)
os.chmod(target, 0o755)
print(f"installed 7-Zip {VERSION} ({arch}) as {target}")
