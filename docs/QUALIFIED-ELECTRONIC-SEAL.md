# EngiCite qualified organisation seal

EngiCite is prepared to apply a PAdES electronic organisation seal to each generated client transmittal PDF through the Adobe PDF Electronic Seal API, using an Intesi Group Cloud Signature Consortium credential.

The integration is disabled by default. While disabled, EngiCite accurately describes the PDF as system-attested and not qualified. If qualified sealing is enabled but any credential or provider call fails, package generation fails instead of silently producing an unsealed transmittal.

## Obtain the credentials

1. Create Adobe PDF Services credentials with access to the PDF Electronic Seal API.
2. Ask Intesi Group for a qualified electronic-seal certificate issued to the legal organisation, with CSC client-credentials authentication and a static credential PIN.
3. Ask Adobe or Intesi for the exact Adobe `providerName` mapping for the issued credential.
4. Obtain an RFC 3161 qualified timestamp service URL and credentials if the Intesi package does not already include them.
5. Keep every secret in the processor's server-side environment. Never put these values in a `NEXT_PUBLIC_` variable or client-side code.

Adobe documents the [credential and REST workflow](https://developer.adobe.com/document-services/docs/overview/pdf-electronic-seal-api/gettingstarted) and the [PAdES, CSC and timestamp parameters](https://developer.adobe.com/document-services/docs/overview/pdf-electronic-seal-api/howtos/electronic-seal-api). Intesi Group appears as a supported trust service provider in Adobe's [Electronic Seal documentation](https://developer.adobe.com/document-services/docs/overview/legacy-documentation/pdf-electronic-seal-api/).

## Configure the processor

Add the following server-only values to `services/processor/.env` in local development and to the processor host's secret manager in production:

```dotenv
ELECTRONIC_SEAL_MODE=adobe_intesi
ELECTRONIC_SEAL_ASSURANCE=unverified
ADOBE_PDF_SERVICES_CLIENT_ID=<Adobe client ID>
ADOBE_PDF_SERVICES_CLIENT_SECRET=<Adobe client secret>
ADOBE_PDF_SERVICES_BASE_URL=https://pdf-services.adobe.io
INTESI_CSC_TOKEN_URL=<Intesi CSC OAuth token URL>
INTESI_CSC_CLIENT_ID=<Intesi client ID>
INTESI_CSC_CLIENT_SECRET=<Intesi client secret>
INTESI_CSC_CREDENTIAL_ID=<qualified seal credential ID>
INTESI_CSC_PIN=<credential PIN>
INTESI_ADOBE_PROVIDER_NAME=<exact Adobe providerName>
QUALIFIED_TSA_URL=<qualified timestamp URL>
QUALIFIED_TSA_USERNAME=<timestamp username, when required>
QUALIFIED_TSA_PASSWORD=<timestamp password, when required>
```

Leave `ELECTRONIC_SEAL_ASSURANCE=unverified` during onboarding and testing. Set it to `qualified_electronic_seal` only after Intesi confirms in writing that this exact credential is a qualified electronic-seal certificate issued to the organisation. That setting controls whether EngiCite is permitted to display “Qualified organisation seal.”

Restart the processor after changing its environment. Create a new transmittal, generate its ZIP, open the transmittal PDF in a trusted PDF reader, and inspect the certificate chain, seal validity and trusted timestamp before using it with a client.

## Important distinction

An organisation electronic seal proves the organisation of origin and protects document integrity. It is not the personal signature of the Document Controller. The client acknowledgement page remains available for the client representative's separate signature or acknowledgement workflow.
