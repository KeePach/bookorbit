"""Small HTTP front for KCC's command-line converter, for BookOrbit (fork).

KCC's image runs one conversion and exits, so this keeps a process up that BookOrbit can call.
It only converts files inside the work folder it shares with BookOrbit, one job at a time.

GET  /health        -> {"ok": true, "version": "13.0.4"}
GET  /options       -> KCC's own option list (groups, flags, types, defaults, help) and device profiles
POST /jobs          -> {"input": "<job>/in/x.cbz", "outputDir": "<job>/out", "args": ["-p", "KoLC", ...]}
GET  /jobs/<id>     -> {"state": "queued|running|done|failed", "outputs": [...], "log": "...", "exitCode": 0}
"""

import json
import os
import queue
import re
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WORK_DIR = os.path.realpath(os.environ.get("KCC_WORK_DIR", "/work"))
PORT = int(os.environ.get("PORT", "8090"))
C2E = os.environ.get("KCC_C2E", "/opt/kcc/kcc-c2e.py")
JOB_TIMEOUT_SECONDS = int(os.environ.get("KCC_JOB_TIMEOUT_SECONDS", "3600"))
FINISHED_JOB_TTL_SECONDS = 6 * 3600
LOG_TAIL_BYTES = 8000
MAX_BODY_BYTES = 64 * 1024

# Set by the server from the request, or never allowed: deleting the source, writing elsewhere,
# merging inputs, or extra positional inputs.
FORBIDDEN_FLAGS = {"-o", "--output", "-d", "--delete", "--filefusion", "-h", "--help"}
FLAG = re.compile(r"^--?[A-Za-z0-9][A-Za-z0-9-]*$")

jobs = {}
jobs_lock = threading.Lock()
work_queue = queue.Queue()


def kcc_version():
    try:
        from kindlecomicconverter import __version__

        return __version__
    except Exception:
        return None


def option_schema():
    from kindlecomicconverter import comic2ebook, image

    parser = comic2ebook.makeParser()
    groups = []
    for group in parser._action_groups:
        options = []
        for action in group._group_actions:
            if not action.option_strings or action.dest in ("help", "input"):
                continue
            if action.const is True and action.nargs == 0:
                kind = "bool"
            elif action.type is int:
                kind = "int"
            elif action.type is float:
                kind = "float"
            else:
                kind = "str"
            default = action.default
            if kind == "int" and isinstance(default, str):
                default = int(default)
            if kind == "float" and isinstance(default, str):
                default = float(default)
            options.append(
                {
                    "dest": action.dest,
                    "flags": list(action.option_strings),
                    "kind": kind,
                    "default": default,
                    "help": action.help or "",
                }
            )
        if options:
            groups.append({"title": group.title, "options": options})
    profiles = [{"code": code, "label": data[0]} for code, data in image.ProfileData.Profiles.items()]
    return {"version": kcc_version(), "groups": groups, "profiles": profiles}


def inside_work_dir(relative):
    if not isinstance(relative, str) or not relative or relative.startswith("/") or "\x00" in relative:
        return None
    path = os.path.realpath(os.path.join(WORK_DIR, relative))
    if path == WORK_DIR or not path.startswith(WORK_DIR + os.sep):
        return None
    return path


def validate_args(args):
    if not isinstance(args, list) or len(args) > 200:
        return "args must be a list"
    expect_value = False
    for arg in args:
        if not isinstance(arg, str) or len(arg) > 500 or "\x00" in arg:
            return "args must be short strings"
        if expect_value:
            expect_value = False
            continue
        name, has_value, _ = arg.partition("=")
        if not FLAG.match(name):
            return f"unexpected argument {arg!r}"
        if name in FORBIDDEN_FLAGS:
            return f"{name} is set by the server"
        expect_value = not has_value and name in VALUE_FLAGS
    return None


def value_flags():
    try:
        flags = set()
        for group in option_schema()["groups"]:
            for option in group["options"]:
                if option["kind"] != "bool":
                    flags.update(option["flags"])
        return flags
    except Exception as error:
        print(f"[kcc.options] [fail] error={error!r} - option list unavailable", flush=True)
        return set()


VALUE_FLAGS = set()


def run_job(job_id):
    with jobs_lock:
        job = jobs[job_id]
        job["state"] = "running"
        job["startedAt"] = time.time()
    output_dir = job["outputDir"]
    os.makedirs(output_dir, exist_ok=True)
    before = set(os.listdir(output_dir))
    command = [sys.executable, C2E, *job["args"], "-o", output_dir, job["input"]]
    print(f"[kcc.job] [start] id={job_id} - converting", flush=True)
    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=JOB_TIMEOUT_SECONDS,
            cwd=os.path.dirname(job["input"]),
            env={**os.environ, "HOME": os.environ.get("HOME", "/tmp")},
        )
        log = result.stdout.decode("utf-8", "replace")
        code = result.returncode
    except subprocess.TimeoutExpired as error:
        log = (error.stdout or b"").decode("utf-8", "replace") + "\nTimed out"
        code = -1
    outputs = sorted(
        os.path.relpath(os.path.join(output_dir, name), WORK_DIR)
        for name in set(os.listdir(output_dir)) - before
        if os.path.isfile(os.path.join(output_dir, name))
    )
    with jobs_lock:
        job["exitCode"] = code
        job["log"] = log[-LOG_TAIL_BYTES:]
        job["outputs"] = outputs
        job["state"] = "done" if code == 0 and outputs else "failed"
        job["finishedAt"] = time.time()
    print(f"[kcc.job] [end] id={job_id} exitCode={code} outputs={len(outputs)} - finished", flush=True)


def worker():
    while True:
        job_id = work_queue.get()
        try:
            run_job(job_id)
        except Exception as error:
            with jobs_lock:
                jobs[job_id].update(state="failed", log=repr(error), exitCode=-1, outputs=[], finishedAt=time.time())
            print(f"[kcc.job] [fail] id={job_id} error={error!r} - job crashed", flush=True)
        finally:
            prune_jobs()


def prune_jobs():
    cutoff = time.time() - FINISHED_JOB_TTL_SECONDS
    with jobs_lock:
        for job_id in [key for key, job in jobs.items() if job.get("finishedAt", time.time()) < cutoff]:
            del jobs[job_id]


class Handler(BaseHTTPRequestHandler):
    server_version = "bookorbit-fork-kcc"

    def log_message(self, format, *args):
        pass

    def send_json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self.send_json(200, {"ok": True, "version": kcc_version()})
        if self.path == "/options":
            try:
                return self.send_json(200, option_schema())
            except Exception as error:
                return self.send_json(500, {"error": f"KCC option list unavailable: {error!r}"})
        match = re.fullmatch(r"/jobs/([0-9a-f-]{36})", self.path)
        if match:
            with jobs_lock:
                job = jobs.get(match.group(1))
                body = None if job is None else {k: job.get(k) for k in ("state", "outputs", "log", "exitCode")}
            return self.send_json(404, {"error": "unknown job"}) if body is None else self.send_json(200, body)
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/jobs":
            return self.send_json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            return self.send_json(400, {"error": "bad body"})
        try:
            body = json.loads(self.rfile.read(length))
        except ValueError:
            return self.send_json(400, {"error": "bad json"})
        source = inside_work_dir(body.get("input"))
        output_dir = inside_work_dir(body.get("outputDir"))
        if not source or not os.path.isfile(source):
            return self.send_json(400, {"error": "input must be a file inside the work folder"})
        if not output_dir:
            return self.send_json(400, {"error": "outputDir must be inside the work folder"})
        problem = validate_args(body.get("args"))
        if problem:
            return self.send_json(400, {"error": problem})
        job_id = str(uuid.uuid4())
        with jobs_lock:
            jobs[job_id] = {"state": "queued", "input": source, "outputDir": output_dir, "args": body["args"]}
        work_queue.put(job_id)
        self.send_json(202, {"id": job_id})


def main():
    global VALUE_FLAGS
    VALUE_FLAGS = value_flags()
    os.makedirs(WORK_DIR, exist_ok=True)
    threading.Thread(target=worker, daemon=True).start()
    print(f"[kcc.server] [start] port={PORT} kccVersion={kcc_version()} - listening", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
