import json

import httpx
import pytest

from app.electronic_seal import (
    AdobeIntesiElectronicSealer,
    AdobeIntesiSealConfig,
    ElectronicSealError,
)


def configured(**overrides):
    values={
        "mode":"adobe_intesi",
        "assurance":"qualified_electronic_seal",
        "adobe_client_id":"adobe-client",
        "adobe_client_secret":"adobe-secret",
        "adobe_base_url":"https://pdf-services.adobe.io",
        "intesi_token_url":"https://seal.intesigroup.example/csc/v0/oauth2/token",
        "intesi_client_id":"intesi-client",
        "intesi_client_secret":"intesi-secret",
        "intesi_credential_id":"credential-id",
        "intesi_pin":"pin-value",
        "adobe_provider_name":"provider-name-from-onboarding",
        "tsa_url":"https://timestamp.intesigroup.example/qualified",
    }
    values.update(overrides)
    return AdobeIntesiSealConfig(**values)


def test_adobe_intesi_seal_flow_is_pades_and_records_evidence():
    job_payload={}
    status_calls=0

    def handler(request:httpx.Request):
        nonlocal status_calls
        if request.url.host=="seal.intesigroup.example":
            return httpx.Response(200,json={"access_token":"tsp-access"})
        if request.url.path=="/token":
            return httpx.Response(200,json={"access_token":"adobe-access"})
        if request.url.path=="/assets":
            return httpx.Response(200,json={
                "assetID":"asset-id",
                "uploadUri":"https://dcplatformstorageservice-prod-us-east-1.s3-accelerate.amazonaws.com/input",
            })
        if request.method=="PUT":
            assert request.content.startswith(b"%PDF-")
            return httpx.Response(200)
        if request.url.path=="/operation/electronicseal":
            job_payload.update(json.loads(request.content))
            return httpx.Response(201,headers={"location":"https://pdf-services.adobe.io/operation/electronicseal/job-id/status"})
        if request.url.path.endswith("/status"):
            status_calls+=1
            if status_calls==1:return httpx.Response(200,json={"status":"in progress"})
            return httpx.Response(200,json={
                "status":"done",
                "downloadUri":"https://dcplatformstorageservice-prod-us-east-1.s3-accelerate.amazonaws.com/output",
            })
        if request.url.path=="/output":
            return httpx.Response(200,content=b"%PDF-1.7\nsealed")
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    client=httpx.Client(transport=httpx.MockTransport(handler))
    sealer=AdobeIntesiElectronicSealer(configured(),client,poll_interval_seconds=0)
    sealed,evidence=sealer.seal(b"%PDF-1.4\ninput")

    assert sealed==b"%PDF-1.7\nsealed"
    assert evidence["status"]=="qualified_electronic_seal"
    assert evidence["trust_service_provider"]=="Intesi Group"
    options=job_payload["sealOptions"]
    assert options["signatureFormat"]=="PADES"
    assert options["documentLevelPermission"]=="FORM_FILLING"
    assert options["tsaOptions"]["url"].startswith("https://")
    assert options["cscCredentialOptions"]["providerName"]=="provider-name-from-onboarding"


def test_enabled_sealer_fails_closed_when_credentials_are_missing():
    sealer=AdobeIntesiElectronicSealer(AdobeIntesiSealConfig(mode="adobe_intesi"))
    with pytest.raises(ElectronicSealError,match="configuration is incomplete"):
        sealer.seal(b"%PDF-1.4\ninput")
    sealer.close()


def test_unverified_certificate_is_not_labelled_qualified():
    status_calls=0
    def handler(request:httpx.Request):
        nonlocal status_calls
        if request.url.host=="seal.intesigroup.example":return httpx.Response(200,json={"access_token":"tsp"})
        if request.url.path=="/token":return httpx.Response(200,json={"access_token":"adobe"})
        if request.url.path=="/assets":return httpx.Response(200,json={"assetID":"asset","uploadUri":"https://dcplatformstorageservice-prod-us-east-1.s3-accelerate.amazonaws.com/input"})
        if request.method=="PUT":return httpx.Response(200)
        if request.url.path=="/operation/electronicseal":return httpx.Response(201,headers={"location":"https://pdf-services.adobe.io/operation/electronicseal/job/status"})
        if request.url.path.endswith("/status"):
            status_calls+=1
            return httpx.Response(200,json={"status":"done","downloadUri":"https://dcplatformstorageservice-prod-us-east-1.s3-accelerate.amazonaws.com/output"})
        return httpx.Response(200,content=b"%PDF-1.7\nsealed")
    sealer=AdobeIntesiElectronicSealer(configured(assurance="unverified"),httpx.Client(transport=httpx.MockTransport(handler)),poll_interval_seconds=0)
    _,evidence=sealer.seal(b"%PDF-1.4\ninput")
    assert evidence["status"]=="electronic_seal"
    assert evidence["qualification"]=="not_asserted"
