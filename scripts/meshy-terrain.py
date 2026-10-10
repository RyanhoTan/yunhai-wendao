#!/usr/bin/env python3
"""Approved terrain -> one Meshy Image-to-3D task, resumable without reposting.

Uses only the Python standard library. prepare is offline; status performs one
bounded lookup. The AI operator synchronizes plan.json from this task checkpoint.
"""
import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import sys
import tempfile
import time
from datetime import datetime, timezone
from urllib import error, request
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://api.meshy.ai/openapi/v1/image-to-3d"
KEY_FILE = Path.home() / ".config/yunhai-wendao/meshy-api-key"


class PipelineError(RuntimeError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save_json(path, value):
    """Write atomically before submitting a potentially billable request."""
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=".meshy-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        Path(name).unlink(missing_ok=True)


def project_file(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise PipelineError("Asset path escapes the project")
    return path


def approved_input(root, batch_id, asset_id, verify_map=True):
    plan = json.loads((root / "artifacts/terrain-pipeline/plan.json").read_text())
    batch = next(b for b in plan["concept_batches"] if b["id"] == batch_id)
    if verify_map:
        terrain_map = plan["map"]
        if terrain_map["approval"]["status"] not in ("approved", "approved_with_constraints"):
            raise PipelineError("Map image is not approved")
        map_sha = digest(project_file(root, terrain_map["image_path"]).read_bytes())
        if map_sha != terrain_map["image_sha256"] or map_sha != terrain_map["approval"]["approved_image_sha256"]:
            raise PipelineError("Map input changed since approval")
        if batch["source_map_version"] != terrain_map["version"] or batch["source_map_sha256"] != map_sha:
            raise PipelineError("Terrain batch belongs to a different approved map version")
    asset = next(a for a in batch["assets"] if a["id"] == asset_id)
    image = project_file(root, asset["image_path"])
    data = image.read_bytes()
    sha = digest(data)
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise PipelineError("Expected the approved PNG input")
    if asset["approval"]["status"] != "approved" or batch["approval"]["status"] != "approved":
        raise PipelineError("This terrain image is not approved")
    if sha != asset["image_sha256"] or sha != asset["approval"]["approved_image_sha256"]:
        raise PipelineError("Terrain input changed since approval")
    if {"asset_id": asset_id, "image_sha256": sha} not in batch["approval"]["approved_assets"]:
        raise PipelineError("Batch approval does not include this exact image")
    review = json.loads(project_file(root, asset["review_path"]).read_text())
    if review["user_approval"]["status"] != "approved" or review["user_approval"]["approved_image_sha256"] != sha:
        raise PipelineError("Review approval disagrees with plan")
    parameters = plan["initial_model_parameters"]
    manifest = {
        "provider": "Meshy", "endpoint": ENDPOINT, "batch_id": batch_id,
        "asset_id": asset_id, "approved_image_path": asset["image_path"],
        "approved_image_sha256": sha, "parameters": parameters,
        "source_map_version": batch["source_map_version"],
        "source_map_sha256": batch["source_map_sha256"],
        "request_image_encoding": "data:image/png;base64 (constructed in memory)",
    }
    return image.parent, data, manifest, asset.get("model_generation", {}).get("task_id")


def credential():
    key = os.environ.get("MESHY_API_KEY", "").strip()
    if not key and KEY_FILE.is_file():
        stat = KEY_FILE.stat()
        if stat.st_mode & 0o077 or stat.st_uid != os.getuid():
            raise PipelineError("Meshy key file must be owned by this user with mode 600")
        key = KEY_FILE.read_text().strip()
    if not key or any(c.isspace() for c in key):
        raise PipelineError("Meshy API key missing; configure the private local key file")
    return key


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward the Authorization header to a redirect destination.
        return None


def api(method, suffix="", payload=None):
    key = credential()
    encoded = None if payload is None else json.dumps(payload).encode()
    req = request.Request(ENDPOINT + suffix, data=encoded, method=method, headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json",
    })
    opener = request.build_opener(NoRedirect())
    attempts = 1 if method == "POST" else 3
    for attempt in range(attempts):
        try:
            with opener.open(req, timeout=45) as response:
                return json.load(response)
        except error.HTTPError as exc:
            if method == "GET" and exc.code in (429, 500, 502, 503, 504) and attempt + 1 < attempts:
                retry = exc.headers.get("Retry-After", str(2 ** attempt))
                delay = float(retry) if retry.isdigit() else 2 ** attempt
                if delay > 30:
                    raise PipelineError("Meshy rate limit requires a later status lookup") from None
                time.sleep(delay)
                continue
            # Do not expose response bodies, credential values or signed URLs.
            raise PipelineError(f"Meshy API returned HTTP {exc.code}") from None
        except (error.URLError, TimeoutError):
            if method == "GET" and attempt + 1 < attempts:
                time.sleep(2 ** attempt)
                continue
            raise PipelineError("Meshy API connection failed") from None


def task_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9-]{1,128}", value):
        raise PipelineError("Invalid Meshy task ID")
    return value


def download_glb(url, path):
    parsed = urlparse(url)
    if parsed.scheme != "https" or not (parsed.hostname or "").endswith(".meshy.ai"):
        raise PipelineError("Unexpected Meshy download host")
    # Downloads carry no API credential. Do not store their expiring URLs.
    partial = path.with_suffix(".glb.part")
    try:
        with request.build_opener(NoRedirect()).open(url, timeout=45) as response, partial.open("wb") as out:
            while block := response.read(1024 * 1024):
                out.write(block)
        data = partial.read_bytes()
        if len(data) < 20 or struct.unpack("<4sII", data[:12]) != (b"glTF", 2, len(data)):
            raise PipelineError("Downloaded file is not a complete GLB v2 container")
        os.replace(partial, path)
        return {"filename": path.name, "bytes": len(data), "sha256": digest(data),
                "validation": "container header only; geometry/material/playability QA pending"}
    except (error.URLError, TimeoutError):
        raise PipelineError("GLB download failed; refresh the existing task, do not regenerate") from None
    finally:
        partial.unlink(missing_ok=True)


def run(command, root=ROOT, batch_id="sect-mountain-v1", asset_id="mountain-body"):
    folder, data, manifest, recorded_id = approved_input(root, batch_id, asset_id, verify_map=False)
    checkpoint = folder / "meshy-job.json"
    with (folder / ".meshy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        job = json.loads(checkpoint.read_text()) if checkpoint.exists() else {
            **manifest, "status": "recorded_task" if recorded_id else "prepared",
            "task_id": task_id(recorded_id) if recorded_id else None,
            "submission_attempts": 1 if recorded_id else 0, "prepared_at": now(),
        }
        if any(job.get(k) != v for k, v in manifest.items() if k != "parameters"):
            raise PipelineError("Checkpoint input differs; do not overwrite a prior task")
        if recorded_id and job["task_id"] != recorded_id:
            raise PipelineError("Plan and task checkpoint disagree; reconcile before continuing")
        if command in ("prepare", "submit") and not job["task_id"]:
            approved_input(root, batch_id, asset_id, verify_map=True)
            if job["parameters"] != manifest["parameters"]:
                raise PipelineError("Prepared parameters changed; do not overwrite a prior task")
        if command == "prepare":
            save_json(folder / "meshy-request.json", {k: job[k] for k in manifest})
            save_json(checkpoint, job)
            return {"status": job["status"], "task_id": job["task_id"], "image_sha256": manifest["approved_image_sha256"]}
        if command == "submit":
            if job["task_id"]:
                return {"status": job["status"], "task_id": job["task_id"], "reused_existing_task": True}
            if job["status"] != "prepared" or job["submission_attempts"] != 0:
                raise PipelineError("Submission may already exist; reconcile Meshy history before any new POST")
            credential()  # Missing credentials must not consume the submission attempt.
            job.update(status="submitting", submission_attempts=1, submission_started_at=now())
            save_json(checkpoint, job)
            try:
                response = api("POST", payload={**manifest["parameters"],
                    "image_url": "data:image/png;base64," + base64.b64encode(data).decode()})
                job.update(task_id=task_id(response.get("result")), status="submitted", submitted_at=now())
            except Exception:
                job.update(status="submission_uncertain", last_checked_at=now())
                save_json(checkpoint, job)
                raise
            save_json(checkpoint, job)
            return {"status": job["status"], "task_id": job["task_id"]}
        if not job["task_id"]:
            raise PipelineError("No Meshy task ID recorded; no task to retrieve")
        ident = task_id(job["task_id"])
        remote = api("GET", "/" + ident)
        if remote.get("id") != ident or remote.get("type") != "image-to-3d":
            raise PipelineError("Retrieved task identity/type mismatch")
        job.update(status=remote["status"], progress=remote.get("progress"), last_checked_at=now())
        if "consumed_credits" in remote:
            job["consumed_credits"] = remote["consumed_credits"]
        save_json(checkpoint, job)
        if command == "download":
            if remote["status"] != "SUCCEEDED":
                raise PipelineError("Meshy task has not succeeded")
            outputs = remote.get("model_urls", {})
            if not outputs.get("glb"):
                raise PipelineError("Successful task has no GLB URL")
            models = folder / "meshy-models"
            models.mkdir(exist_ok=True)
            files = []
            for kind in ("glb", "pre_remeshed_glb"):
                if outputs.get(kind):
                    files.append(download_glb(outputs[kind], models / (kind + ".glb")))
                    job.update(downloaded_files=files, downloaded_at=now())
                    save_json(checkpoint, job)
        return {k: job[k] for k in ("status", "task_id", "progress", "consumed_credits", "downloaded_files") if k in job}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "submit", "status", "download"))
    parser.add_argument("--batch", default="sect-mountain-v1")
    parser.add_argument("--asset", default="mountain-body")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.command, batch_id=args.batch, asset_id=args.asset), ensure_ascii=False))
    except (PipelineError, OSError, ValueError, KeyError, StopIteration) as exc:
        # Never print unexpected exceptions that could include request contents.
        message = str(exc) if isinstance(exc, PipelineError) else "Local input/checkpoint operation failed"
        print(message, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
