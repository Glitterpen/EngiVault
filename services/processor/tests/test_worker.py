import hashlib
from pathlib import Path

from pypdf import PdfWriter

from app.extraction import ExtractionResult
from app.validation import MIME_PDF
from app.worker import ProcessingJob, process_next


class FakeGateway:
    def __init__(self, content: bytes, job: ProcessingJob | None) -> None:
        self.content = content
        self.job = job
        self.result: ExtractionResult | None = None
        self.finished: dict[str, object] | None = None

    def claim(self) -> ProcessingJob | None:
        job, self.job = self.job, None
        return job

    def download(self, job: ProcessingJob, target: Path) -> None:
        target.write_bytes(self.content)

    def replace_units(self, job: ProcessingJob, result: ExtractionResult) -> None:
        self.result = result

    def replace_search_chunks(self, job: ProcessingJob, result: ExtractionResult,
                              embeddings: list[list[float]], embedding_model: str | None) -> None:
        self.result=result

    def finish(self, job: ProcessingJob, **result: object) -> None:
        self.finished = result


def job_for(content: bytes) -> ProcessingJob:
    return ProcessingJob(run_id="10000000-0000-0000-0000-000000000001",
                         organisation_id="20000000-0000-0000-0000-000000000001",
                         project_id="30000000-0000-0000-0000-000000000001",
                         revision_id="40000000-0000-0000-0000-000000000001",
                         document_id="50000000-0000-0000-0000-000000000001",
                         storage_key="organisations/200/projects/300/revisions/400/drawing.pdf",
                         declared_mime=MIME_PDF, byte_size=len(content),
                         sha256=hashlib.sha256(content).hexdigest(), pipeline_version="v1", attempt=1)


def pdf_bytes(tmp_path: Path) -> bytes:
    path = tmp_path / "source.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    with path.open("wb") as stream:
        writer.write(stream)
    return path.read_bytes()


def test_process_next_commits_extracted_units(tmp_path: Path) -> None:
    content = pdf_bytes(tmp_path)
    gateway = FakeGateway(content, job_for(content))
    assert process_next(gateway) == "processed"
    assert gateway.result is not None
    assert gateway.result.units[0].page_number == 1
    assert gateway.finished is not None and gateway.finished["succeeded"] is True


def test_invalid_signature_fails_without_storing_units() -> None:
    content = b"MZ\x90\x00renamed executable"
    gateway = FakeGateway(content, job_for(content))
    assert process_next(gateway) == "failed"
    assert gateway.result is None
    assert gateway.finished is not None
    assert gateway.finished["failure_code"] == "UNSUPPORTED_SIGNATURE"


def test_idle_queue_performs_no_mutation() -> None:
    gateway = FakeGateway(b"", None)
    assert process_next(gateway) == "idle"
    assert gateway.finished is None


def test_embedding_failure_still_completes_full_text_processing(tmp_path: Path) -> None:
    class FailedEmbedder:
        model = "unavailable-model"

        def embed(self, _: list[str]) -> list[list[float]]:
            raise RuntimeError("provider unavailable")

    content = pdf_bytes(tmp_path)
    gateway = FakeGateway(content, job_for(content))
    assert process_next(gateway, embedder=FailedEmbedder()) == "processed"
    assert gateway.finished is not None
    assert gateway.finished["succeeded"] is True
    assert gateway.finished["metrics"]["semantic_indexed"] is False  # type: ignore[index]
