"""Offline regressions for approval gates and potentially billable submission.

No Meshy request or credential is used by these tests.
"""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("meshy_terrain", Path(__file__).with_name("meshy-terrain.py"))
pipeline = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pipeline)


class TerrainPipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.folder = self.root / "artifacts/terrain-pipeline/concepts/sect-mountain-v1/mountain-body"
        self.folder.mkdir(parents=True)
        self.image = b"\x89PNG\r\n\x1a\nOFFLINE-FIXTURE"
        (self.folder / "concept.png").write_bytes(self.image)
        self.sha = pipeline.digest(self.image)
        self.map_image = self.root / "map.png"
        self.map_image.write_bytes(b"OFFLINE-MAP")
        self.map_sha = pipeline.digest(self.map_image.read_bytes())
        self.asset = {
            "id": "mountain-body", "image_path": str((self.folder / "concept.png").relative_to(self.root)),
            "image_sha256": self.sha,
            "review_path": str((self.folder / "review.json").relative_to(self.root)),
            "approval": {"status": "approved", "approved_image_sha256": self.sha},
        }
        (self.folder / "review.json").write_text(json.dumps({"user_approval": self.asset["approval"]}))
        self.plan = {
            "map": {"version": "map-v1", "image_path": "map.png", "image_sha256": self.map_sha,
                "approval": {"status": "approved_with_constraints", "approved_image_sha256": self.map_sha}},
            "initial_model_parameters": {"ai_model": "meshy-7.1", "target_formats": ["glb"]},
            "concept_batches": [{"id": "sect-mountain-v1", "assets": [self.asset],
                "source_map_version": "map-v1", "source_map_sha256": self.map_sha,
                "approval": {"status": "approved", "approved_assets": [
                    {"asset_id": "mountain-body", "image_sha256": self.sha}]}}],
        }
        self.write_plan()

    def tearDown(self):
        self.temp.cleanup()

    def write_plan(self):
        (self.root / "artifacts/terrain-pipeline/plan.json").write_text(json.dumps(self.plan))

    def run_command(self, command):
        return pipeline.run(command, root=self.root)

    def job(self):
        return json.loads((self.folder / "meshy-job.json").read_text())

    def test_prepare_offline_stores_no_secret_or_image_payload(self):
        with patch.object(pipeline, "api") as api, patch.object(pipeline, "credential") as key:
            result = self.run_command("prepare")
            api.assert_not_called()
            key.assert_not_called()
        self.assertIsNone(result["task_id"])
        self.assertEqual(self.job()["submission_attempts"], 0)
        manifest = (self.folder / "meshy-request.json").read_text()
        self.assertNotIn('"image_url"', manifest)
        self.assertNotIn('"Authorization"', manifest)

    def test_unapproved_or_changed_input_never_posts(self):
        with patch.object(pipeline, "api") as api:
            self.asset["approval"]["status"] = "pending"
            self.write_plan()
            with self.assertRaises(pipeline.PipelineError):
                self.run_command("submit")
            self.asset["approval"]["status"] = "approved"
            self.write_plan()
            (self.folder / "concept.png").write_bytes(self.image + b"changed")
            with self.assertRaises(pipeline.PipelineError):
                self.run_command("submit")
            api.assert_not_called()

    def test_map_approval_does_not_cover_asset_or_batch(self):
        self.plan["concept_batches"][0]["approval"]["approved_assets"] = []
        self.write_plan()
        with patch.object(pipeline, "api") as api, self.assertRaises(pipeline.PipelineError):
            self.run_command("submit")
        api.assert_not_called()

    def test_changed_map_bytes_or_new_map_version_cannot_submit_old_batch(self):
        with patch.object(pipeline, "api") as api:
            self.map_image.write_bytes(b"MODIFIED-MAP")
            with self.assertRaises(pipeline.PipelineError):
                self.run_command("submit")
            self.plan["map"].update(version="map-v2", image_sha256=pipeline.digest(self.map_image.read_bytes()))
            self.plan["map"]["approval"]["approved_image_sha256"] = self.plan["map"]["image_sha256"]
            self.write_plan()
            with self.assertRaises(pipeline.PipelineError):
                self.run_command("submit")
            api.assert_not_called()

    def test_missing_key_preserves_initial_attempt(self):
        self.run_command("prepare")
        with patch.object(pipeline, "credential", side_effect=pipeline.PipelineError("missing")), patch.object(pipeline, "api") as api:
            with self.assertRaises(pipeline.PipelineError):
                self.run_command("submit")
            api.assert_not_called()
        self.assertEqual(self.job()["submission_attempts"], 0)
        self.assertEqual(self.job()["status"], "prepared")

    def test_checkpoint_precedes_post_and_resume_never_reposts(self):
        def accept(method, **kwargs):
            self.assertEqual(method, "POST")
            self.assertEqual(self.job()["status"], "submitting")
            self.assertEqual(self.job()["submission_attempts"], 1)
            self.assertTrue(kwargs["payload"]["image_url"].startswith("data:image/png;base64,"))
            return {"result": "real-test-task-id"}
        with patch.object(pipeline, "credential", return_value="offline-secret"), patch.object(pipeline, "api", side_effect=accept) as api:
            self.run_command("submit")
            result = self.run_command("submit")
            self.assertEqual(api.call_count, 1)
            self.assertTrue(result["reused_existing_task"])
        self.assertNotIn("offline-secret", (self.folder / "meshy-job.json").read_text())

    def test_uncertain_submission_is_never_automatically_retried(self):
        with patch.object(pipeline, "credential", return_value="offline-secret"), patch.object(pipeline, "api", side_effect=pipeline.PipelineError("connection failed")) as api:
            with self.assertRaises(pipeline.PipelineError):
                self.run_command("submit")
            with self.assertRaises(pipeline.PipelineError):
                self.run_command("submit")
            self.assertEqual(api.call_count, 1)
        self.assertEqual(self.job()["status"], "submission_uncertain")

    def test_existing_checkpoint_cannot_be_overwritten_with_new_parameters(self):
        self.run_command("prepare")
        before = copy.deepcopy(self.job())
        self.plan["initial_model_parameters"]["ai_model"] = "different"
        self.write_plan()
        with self.assertRaises(pipeline.PipelineError):
            self.run_command("prepare")
        self.assertEqual(self.job(), before)

    def test_recorded_plan_task_prevents_repost_if_checkpoint_missing(self):
        self.asset["model_generation"] = {"task_id": "previously-accepted-task"}
        self.write_plan()
        with patch.object(pipeline, "api") as api:
            result = self.run_command("submit")
            api.assert_not_called()
        self.assertEqual(result["task_id"], "previously-accepted-task")

    def test_concurrent_operator_cannot_submit_under_another_lock(self):
        with (self.folder / ".meshy.lock").open("a") as lock:
            pipeline.fcntl.flock(lock, pipeline.fcntl.LOCK_EX | pipeline.fcntl.LOCK_NB)
            with patch.object(pipeline, "api") as api, self.assertRaises(BlockingIOError):
                self.run_command("submit")
            api.assert_not_called()

    def test_http_post_is_not_retried(self):
        opener = unittest.mock.Mock()
        opener.open.side_effect = pipeline.error.HTTPError(pipeline.ENDPOINT, 503, "transient", {}, None)
        with patch.object(pipeline, "credential", return_value="offline-secret"), patch.object(pipeline.request, "build_opener", return_value=opener):
            with self.assertRaises(pipeline.PipelineError):
                pipeline.api("POST", payload={"image_url": "offline"})
        self.assertEqual(opener.open.call_count, 1)

    def test_download_rejects_untrusted_host_and_truncated_glb(self):
        target = self.folder / "glb.glb"
        with self.assertRaises(pipeline.PipelineError):
            pipeline.download_glb("https://untrusted.example/file", target)
        import io
        opener = unittest.mock.Mock()
        opener.open.return_value = io.BytesIO(b"glTF truncated")
        with patch.object(pipeline.request, "build_opener", return_value=opener), self.assertRaises(pipeline.PipelineError):
            pipeline.download_glb("https://assets.meshy.ai/file", target)
        self.assertFalse(target.exists())
        self.assertFalse(target.with_suffix(".glb.part").exists())

    def accepted_task(self):
        with patch.object(pipeline, "credential", return_value="offline-secret"), patch.object(pipeline, "api", return_value={"result": "real-test-task-id"}):
            self.run_command("submit")

    def test_status_fetches_existing_task_and_persists_observed_credits_without_urls(self):
        self.accepted_task()
        remote = {"id": "real-test-task-id", "type": "image-to-3d", "status": "SUCCEEDED",
            "progress": 100, "consumed_credits": 47,
            "model_urls": {"glb": "https://assets.meshy.ai/file.glb?private-signed-query"}}
        with patch.object(pipeline, "api", return_value=remote) as api:
            self.run_command("status")
            api.assert_called_once_with("GET", "/real-test-task-id")
        self.assertEqual(self.job()["consumed_credits"], 47)
        self.assertNotIn("private-signed-query", (self.folder / "meshy-job.json").read_text())

    def test_existing_task_resume_uses_frozen_parameters_after_next_asset_changes(self):
        self.accepted_task()
        frozen = copy.deepcopy(self.job()["parameters"])
        self.plan["initial_model_parameters"]["target_polycount"] = 30000
        self.plan["map"]["version"] = "map-v2"
        self.write_plan()
        remote = {"id": "real-test-task-id", "type": "image-to-3d", "status": "IN_PROGRESS", "progress": 50}
        with patch.object(pipeline, "api", return_value=remote) as api:
            self.run_command("status")
            api.assert_called_once_with("GET", "/real-test-task-id")
        self.run_command("prepare")
        self.assertEqual(self.job()["parameters"], frozen)
        self.assertEqual(json.loads((self.folder / "meshy-request.json").read_text())["parameters"], frozen)

    def test_failed_or_wrong_task_does_not_download(self):
        self.accepted_task()
        for remote in (
            {"id": "other", "type": "image-to-3d", "status": "SUCCEEDED"},
            {"id": "real-test-task-id", "type": "image-to-3d", "status": "FAILED"},
        ):
            with patch.object(pipeline, "api", return_value=remote), patch.object(pipeline, "download_glb") as download:
                with self.assertRaises(pipeline.PipelineError):
                    self.run_command("download")
                download.assert_not_called()

    def test_partial_download_checkpoint_keeps_finished_file(self):
        self.accepted_task()
        remote = {"id": "real-test-task-id", "type": "image-to-3d", "status": "SUCCEEDED",
            "model_urls": {"glb": "https://assets.meshy.ai/a.glb", "pre_remeshed_glb": "https://assets.meshy.ai/b.glb"}}
        def download(url, path):
            if path.name == "pre_remeshed_glb.glb":
                raise pipeline.PipelineError("second download failed")
            return {"filename": path.name, "sha256": "completed-output"}
        with patch.object(pipeline, "api", return_value=remote), patch.object(pipeline, "download_glb", side_effect=download):
            with self.assertRaises(pipeline.PipelineError):
                self.run_command("download")
        self.assertEqual(self.job()["downloaded_files"][0]["filename"], "glb.glb")
        self.assertEqual(self.job()["task_id"], "real-test-task-id")


if __name__ == "__main__":
    unittest.main()
