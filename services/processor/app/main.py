import hmac
import time
from collections import defaultdict, deque

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from pydantic import UUID4, BaseModel, Field

from .answers import OpenAIAnswerer
from .comparison import compare_units
from .config import settings
from .electronic_seal import AdobeIntesiElectronicSealer, AdobeIntesiSealConfig
from .embeddings import OpenAIEmbedder
from .gateway import GatewayError, SupabaseGateway
from .mdr_import import MdrImportError, parse_mdr_workbook
from .packages import build_package
from .worker import process_next

app = FastAPI(title="EngiCite document processor", version="0.2.0", docs_url=None, redoc_url=None)
_requests: dict[str, deque[float]] = defaultdict(deque)

@app.middleware("http")
async def harden_requests(request, call_next):
    if request.method not in {"GET", "HEAD"}:
        length = request.headers.get("content-length")
        maximum = 5_242_880 if request.url.path == "/internal/v1/parse-mdr-import" else 1_048_576
        if length and int(length) > maximum:
            return Response(status_code=413, content="Request body is too large")
    if request.url.path != "/internal/v1/health/live":
        key = request.headers.get("x-processor-secret", "anonymous")[:16]
        now = time.monotonic()
        window = _requests[key]
        while window and window[0] < now - 60:
            window.popleft()
        if len(window) >= 120:
            return Response(status_code=429, content="Request rate exceeded", headers={"Retry-After": "60"})
        window.append(now)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response

class RevisionJob(BaseModel):
    job_id: UUID4
    organisation_id: UUID4
    project_id: UUID4
    revision_id: UUID4
    correlation_id: str
    pipeline_version: str = "v1"

class EmbeddingQuery(BaseModel):
    text: str

class AnswerEvidence(BaseModel):
    content: str = Field(min_length=1, max_length=12000)

class AnswerQuery(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    evidence: list[AnswerEvidence] = Field(min_length=1, max_length=15)

class ComparisonQuery(BaseModel):
    comparison_id: UUID4
    base_revision_id: UUID4
    target_revision_id: UUID4
class PackageQuery(BaseModel):
    package_id: UUID4
class PackageDownloadQuery(BaseModel):
    package_id: UUID4

def require_service(x_processor_secret: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_processor_secret, settings().processor_shared_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service credential")


@app.post("/internal/v1/parse-mdr-import", dependencies=[Depends(require_service)])
async def parse_mdr_import(request: Request, x_filename: str = Header(default="MDR-Import.xlsx")) -> dict[str, object]:
    content = await request.body()
    if not content or len(content) > 5_242_880:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Excel file must be no larger than 5 MB")
    try:
        return parse_mdr_workbook(content, x_filename)
    except MdrImportError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error

@app.get("/internal/v1/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/internal/v1/health/ready")
def ready() -> dict[str, str]:
    configured = settings().supabase_url and settings().supabase_service_role_key
    if not configured:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Processor storage is not configured")
    return {"status": "ready"}

@app.post("/internal/v1/process-next", dependencies=[Depends(require_service)])
def process_next_revision() -> dict[str, str]:
    config = settings()
    if not config.supabase_url or not config.supabase_service_role_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Processor storage is not configured")
    gateway = SupabaseGateway(config.supabase_url, config.supabase_service_role_key,
                              config.storage_bucket, config.worker_name)
    embedder = OpenAIEmbedder(config.openai_api_key,config.embedding_model,config.embedding_dimensions) if config.openai_api_key else None
    try:
        outcome = process_next(gateway, max_file_bytes=config.max_file_bytes,embedder=embedder)
    finally:
        gateway.close()
        if embedder: embedder.close()
    return {"state": outcome}

@app.post("/internal/v1/process-revision", dependencies=[Depends(require_service)], status_code=202)
def process_revision(job: RevisionJob) -> dict[str, str]:
    # The milestone-4 worker will load the revision ancestry from PostgreSQL and fail closed
    # before fetching its server-derived storage key. Arbitrary URLs are intentionally absent.
    return {"jobId": str(job.job_id), "state": "accepted"}

@app.post("/internal/v1/embed-query", dependencies=[Depends(require_service)])
def embed_query(query: EmbeddingQuery) -> dict[str, object]:
    config=settings()
    if not config.openai_api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,detail="Embedding service is not configured")
    text=query.text.strip()
    if not text or len(text)>500:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,detail="Query must contain 1 to 500 characters")
    embedder=OpenAIEmbedder(config.openai_api_key,config.embedding_model,config.embedding_dimensions)
    try: vector=embedder.embed([text])[0]
    finally: embedder.close()
    return {"embedding":vector,"model":config.embedding_model,"dimensions":config.embedding_dimensions}

@app.post("/internal/v1/answer", dependencies=[Depends(require_service)])
def answer_query(query: AnswerQuery) -> dict[str, object]:
    config=settings()
    if not config.openai_api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,detail="Answer service is not configured")
    answerer=OpenAIAnswerer(config.openai_api_key,config.chat_model)
    try:
        return answerer.answer(query.question.strip(),[item.model_dump() for item in query.evidence])
    except (httpx.HTTPError,ValueError,KeyError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,detail="Grounded answer generation failed") from error
    finally:
        answerer.close()

@app.post("/internal/v1/compare", dependencies=[Depends(require_service)])
def compare_revisions(query: ComparisonQuery) -> dict[str, object]:
    config=settings();gateway=SupabaseGateway(config.supabase_url,config.supabase_service_role_key,config.storage_bucket,config.worker_name)
    try:
        summary,changes=compare_units(gateway.comparison_units(str(query.base_revision_id)),gateway.comparison_units(str(query.target_revision_id)))
        gateway.finish_comparison(str(query.comparison_id),summary,changes)
        return {"state":"ready","summary":summary}
    except Exception as error:
        try:gateway.finish_comparison(str(query.comparison_id),{},[],"COMPARISON_ERROR")
        except GatewayError:pass
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,detail="Revision comparison failed") from error
    finally:gateway.close()

@app.post("/internal/v1/build-package", dependencies=[Depends(require_service)])
def build_work_package(query: PackageQuery) -> dict[str, object]:
    config=settings();gateway=SupabaseGateway(config.supabase_url,config.supabase_service_role_key,config.storage_bucket,config.worker_name);sealer=AdobeIntesiElectronicSealer(AdobeIntesiSealConfig.from_settings(config))
    try:return {"state":"ready","manifest":build_package(gateway,str(query.package_id),sealer)}
    except Exception as error:
        try:gateway.finish_package(str(query.package_id),None,{},"PACKAGE_BUILD_ERROR")
        except GatewayError:pass
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,detail="Work package generation failed") from error
    finally:sealer.close();gateway.close()

@app.post("/internal/v1/package-download-url", dependencies=[Depends(require_service)])
def package_download_url(query: PackageDownloadQuery) -> dict[str, str]:
    config=settings();gateway=SupabaseGateway(config.supabase_url,config.supabase_service_role_key,config.storage_bucket,config.worker_name)
    try:return {"url":gateway.package_download_url(str(query.package_id))}
    except GatewayError as error:raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="Ready package download is unavailable") from error
    finally:gateway.close()
