import hmac

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import UUID4, BaseModel

from .config import settings

app = FastAPI(title="EngiVault document processor", version="0.1.0", docs_url=None, redoc_url=None)

class RevisionJob(BaseModel):
    job_id: UUID4
    organisation_id: UUID4
    project_id: UUID4
    revision_id: UUID4
    correlation_id: str
    pipeline_version: str = "v1"

def require_service(x_processor_secret: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_processor_secret, settings().processor_shared_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service credential")

@app.get("/internal/v1/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/internal/v1/health/ready")
def ready() -> dict[str, str]:
    return {"status": "ready"}

@app.post("/internal/v1/process-revision", dependencies=[Depends(require_service)], status_code=202)
def process_revision(job: RevisionJob) -> dict[str, str]:
    # The milestone-4 worker will load the revision ancestry from PostgreSQL and fail closed
    # before fetching its server-derived storage key. Arbitrary URLs are intentionally absent.
    return {"jobId": str(job.job_id), "state": "accepted"}
