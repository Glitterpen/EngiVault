from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol
from urllib.parse import urlparse

import httpx


class ElectronicSealError(RuntimeError):
    """Raised when a requested seal cannot be applied safely."""


class ElectronicSealer(Protocol):
    @property
    def enabled(self) -> bool: ...

    def seal(self, pdf: bytes) -> tuple[bytes, dict[str, object]]: ...


@dataclass(frozen=True)
class AdobeIntesiSealConfig:
    mode: str = "disabled"
    assurance: str = "unverified"
    adobe_client_id: str = ""
    adobe_client_secret: str = ""
    adobe_base_url: str = "https://pdf-services.adobe.io"
    intesi_token_url: str = ""
    intesi_client_id: str = ""
    intesi_client_secret: str = ""
    intesi_credential_id: str = ""
    intesi_pin: str = ""
    adobe_provider_name: str = ""
    tsa_url: str = ""
    tsa_username: str = ""
    tsa_password: str = ""

    @classmethod
    def from_settings(cls, settings: object) -> AdobeIntesiSealConfig:
        return cls(
            mode=str(getattr(settings, "electronic_seal_mode", "disabled")),
            assurance=str(getattr(settings, "electronic_seal_assurance", "unverified")),
            adobe_client_id=str(getattr(settings, "adobe_pdf_services_client_id", "")),
            adobe_client_secret=str(getattr(settings, "adobe_pdf_services_client_secret", "")),
            adobe_base_url=str(getattr(settings, "adobe_pdf_services_base_url", "https://pdf-services.adobe.io")),
            intesi_token_url=str(getattr(settings, "intesi_csc_token_url", "")),
            intesi_client_id=str(getattr(settings, "intesi_csc_client_id", "")),
            intesi_client_secret=str(getattr(settings, "intesi_csc_client_secret", "")),
            intesi_credential_id=str(getattr(settings, "intesi_csc_credential_id", "")),
            intesi_pin=str(getattr(settings, "intesi_csc_pin", "")),
            adobe_provider_name=str(getattr(settings, "intesi_adobe_provider_name", "")),
            tsa_url=str(getattr(settings, "qualified_tsa_url", "")),
            tsa_username=str(getattr(settings, "qualified_tsa_username", "")),
            tsa_password=str(getattr(settings, "qualified_tsa_password", "")),
        )


class AdobeIntesiElectronicSealer:
    """Apply a PAdES organisation seal using Adobe PDF Services and Intesi CSC credentials."""

    def __init__(
        self,
        config: AdobeIntesiSealConfig,
        client: httpx.Client | None = None,
        *,
        poll_attempts: int = 30,
        poll_interval_seconds: float = 1.0,
    ) -> None:
        self.config = config
        self.client = client or httpx.Client(timeout=httpx.Timeout(30.0, read=90.0))
        self._owns_client = client is None
        self.poll_attempts = poll_attempts
        self.poll_interval_seconds = poll_interval_seconds

    @property
    def enabled(self) -> bool:
        return self.config.mode.strip().lower() == "adobe_intesi"

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

    def seal(self, pdf: bytes) -> tuple[bytes, dict[str, object]]:
        if not self.enabled:
            raise ElectronicSealError("The qualified electronic seal service is disabled.")
        self._validate_configuration()
        if not pdf.startswith(b"%PDF-"):
            raise ElectronicSealError("Only a valid PDF transmittal can be electronically sealed.")
        if len(pdf) > 100 * 1024 * 1024:
            raise ElectronicSealError("Adobe Electronic Seal accepts PDF files up to 100 MB.")

        try:
            tsp_token = self._tsp_token()
            adobe_token = self._adobe_token()
            asset_id, upload_uri = self._create_asset(adobe_token)
            self._upload_pdf(upload_uri, pdf)
            job_location = self._create_job(adobe_token, asset_id, tsp_token)
            download_uri = self._wait_for_result(adobe_token, job_location)
            sealed_pdf = self._download_pdf(download_uri)
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
            raise ElectronicSealError("The qualified electronic seal provider could not complete the request.") from error

        if not sealed_pdf.startswith(b"%PDF-"):
            raise ElectronicSealError("The electronic seal provider returned an invalid PDF.")

        qualified = self.config.assurance.strip().lower() == "qualified_electronic_seal"
        return sealed_pdf, {
            "status": "qualified_electronic_seal" if qualified else "electronic_seal",
            "qualification": "provider_verified" if qualified else "not_asserted",
            "platform": "Adobe PDF Electronic Seal API",
            "trust_service_provider": "Intesi Group",
            "signature_format": "PAdES",
            "document_level_permission": "form_filling",
            "sealed_pdf_sha256": hashlib.sha256(sealed_pdf).hexdigest(),
            "completed_at": datetime.now(UTC).isoformat(),
            "job_reference": _safe_job_reference(job_location),
        }

    def _validate_configuration(self) -> None:
        if self.config.mode.strip().lower() not in {"disabled", "adobe_intesi"}:
            raise ElectronicSealError("ELECTRONIC_SEAL_MODE has an unsupported value.")
        required = {
            "ADOBE_PDF_SERVICES_CLIENT_ID": self.config.adobe_client_id,
            "ADOBE_PDF_SERVICES_CLIENT_SECRET": self.config.adobe_client_secret,
            "INTESI_CSC_TOKEN_URL": self.config.intesi_token_url,
            "INTESI_CSC_CLIENT_ID": self.config.intesi_client_id,
            "INTESI_CSC_CLIENT_SECRET": self.config.intesi_client_secret,
            "INTESI_CSC_CREDENTIAL_ID": self.config.intesi_credential_id,
            "INTESI_CSC_PIN": self.config.intesi_pin,
            "INTESI_ADOBE_PROVIDER_NAME": self.config.adobe_provider_name,
        }
        missing = [name for name, value in required.items() if not value.strip()]
        if missing:
            raise ElectronicSealError(f"Electronic seal configuration is incomplete: {', '.join(missing)}")
        _require_https(self.config.adobe_base_url, "Adobe API")
        _require_https(self.config.intesi_token_url, "Intesi CSC token")
        if self.config.tsa_url:
            _require_https(self.config.tsa_url, "timestamp authority")

    def _adobe_headers(self, access_token: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {access_token}",
            "x-api-key": self.config.adobe_client_id,
        }

    def _tsp_token(self) -> str:
        response = self.client.post(
            self.config.intesi_token_url,
            headers={"cache-control": "no-cache"},
            json={
                "lang": "en-US",
                "client_id": self.config.intesi_client_id,
                "client_secret": self.config.intesi_client_secret,
                "grant_type": "client_credentials",
            },
        )
        response.raise_for_status()
        return _required_string(response.json(), "access_token")

    def _adobe_token(self) -> str:
        response = self.client.post(
            f"{self.config.adobe_base_url.rstrip('/')}/token",
            data={
                "client_id": self.config.adobe_client_id,
                "client_secret": self.config.adobe_client_secret,
            },
        )
        response.raise_for_status()
        return _required_string(response.json(), "access_token")

    def _create_asset(self, access_token: str) -> tuple[str, str]:
        response = self.client.post(
            f"{self.config.adobe_base_url.rstrip('/')}/assets",
            headers=self._adobe_headers(access_token),
            json={"mediaType": "application/pdf"},
        )
        response.raise_for_status()
        body = response.json()
        upload_uri = _required_string(body, "uploadUri")
        _require_adobe_asset_url(upload_uri)
        return _required_string(body, "assetID"), upload_uri

    def _upload_pdf(self, upload_uri: str, pdf: bytes) -> None:
        response = self.client.put(upload_uri, headers={"Content-Type": "application/pdf"}, content=pdf)
        response.raise_for_status()

    def _create_job(self, access_token: str, asset_id: str, tsp_token: str) -> str:
        seal_options: dict[str, object] = {
            "signatureFormat": "PADES",
            "documentLevelPermission": "FORM_FILLING",
            "cscCredentialOptions": {
                "authorizationContext": {"accessToken": tsp_token, "tokenType": "Bearer"},
                "credentialAuthParameters": {"pin": self.config.intesi_pin},
                "providerName": self.config.adobe_provider_name,
                "credentialId": self.config.intesi_credential_id,
            },
            "sealFieldOptions": {
                "pageNumber": 1,
                "fieldName": "EngiCiteQualifiedOrganisationSeal",
                "visible": True,
                "location": {"left": 327, "bottom": 91, "right": 539, "top": 155},
            },
            "sealAppearanceOptions": {
                "displayOptions": ["NAME", "DATE", "LABELS", "DISTINGUISHED_NAME"]
            },
        }
        if self.config.tsa_url:
            tsa_options: dict[str, object] = {"url": self.config.tsa_url}
            if self.config.tsa_username or self.config.tsa_password:
                tsa_options["credentialAuthParameters"] = {
                    "username": self.config.tsa_username,
                    "password": self.config.tsa_password,
                }
            seal_options["tsaOptions"] = tsa_options
        response = self.client.post(
            f"{self.config.adobe_base_url.rstrip('/')}/operation/electronicseal",
            headers=self._adobe_headers(access_token),
            json={"inputDocumentAssetID": asset_id, "sealOptions": seal_options},
        )
        response.raise_for_status()
        location = response.headers.get("location", "")
        _require_adobe_api_url(location)
        return location

    def _wait_for_result(self, access_token: str, job_location: str) -> str:
        for attempt in range(self.poll_attempts):
            response = self.client.get(job_location, headers=self._adobe_headers(access_token))
            response.raise_for_status()
            body = response.json()
            state = str(body.get("status", "")).strip().lower().replace("_", " ")
            if state == "done":
                download_uri = str(body.get("downloadUri") or body.get("dowloadUri") or "")
                _require_adobe_asset_url(download_uri)
                return download_uri
            if state == "failed":
                raise ElectronicSealError("Adobe reported that the electronic seal job failed.")
            if state not in {"in progress", "inprogress", "pending"}:
                raise ElectronicSealError("Adobe returned an unknown electronic seal job state.")
            if attempt + 1 < self.poll_attempts and self.poll_interval_seconds:
                time.sleep(self.poll_interval_seconds)
        raise ElectronicSealError("The electronic seal job did not finish within the allowed time.")

    def _download_pdf(self, download_uri: str) -> bytes:
        response = self.client.get(download_uri)
        response.raise_for_status()
        return response.content


def _required_string(body: object, key: str) -> str:
    if not isinstance(body, dict):
        raise TypeError("Provider response must be an object.")
    value = body.get(key)
    if not isinstance(value, str) or not value.strip():
        raise KeyError(key)
    return value


def _require_https(url: str, label: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ElectronicSealError(f"The configured {label} URL must be a credential-free HTTPS URL.")


def _require_adobe_api_url(url: str) -> None:
    _require_https(url, "Adobe job")
    hostname = (urlparse(url).hostname or "").lower()
    if hostname != "pdf-services.adobe.io" and not hostname.endswith(".adobe.io"):
        raise ElectronicSealError("Adobe returned an unexpected job host.")


def _require_adobe_asset_url(url: str) -> None:
    _require_https(url, "Adobe asset")
    hostname = (urlparse(url).hostname or "").lower()
    allowed = (
        hostname == "pdf-services.adobe.io"
        or hostname.endswith(".adobe.io")
        or hostname == "dcplatformstorageservice-prod-us-east-1.s3-accelerate.amazonaws.com"
        or hostname == "dcplatformstorageservice-prod-eu-west-1.s3.amazonaws.com"
    )
    if not allowed:
        raise ElectronicSealError("Adobe returned an unexpected asset host.")


def _safe_job_reference(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    return path.rsplit("/", 1)[-1][:160]
