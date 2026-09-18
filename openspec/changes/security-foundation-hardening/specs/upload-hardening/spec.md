# upload-hardening Specification

## Purpose

Safe image handling: magic-byte type allowlist, size cap, `Content-Disposition`, authenticated write/delete, public-read-only bucket. Realizes part of proposal capability `upload-and-cors`. Traces: explore Axis-6 (upload trusts `file.ContentType`, any MIME/size, anonymous delete, public write-capable surface).

## Requirements

### Requirement: Magic-byte type allowlist

`POST /api/imagenes/upload` MUST accept only image types (jpeg, png, webp) validated by inspecting file magic bytes, independent of the client-supplied `file.ContentType`. Files whose content is not an allowed image MUST be rejected with `415` (or `400`).

Traces: explore Axis-6 (trusts ContentType) · proposal upload-and-cors

#### Scenario: Renamed executable rejected

- GIVEN a file named `payload.jpg` whose bytes are not a valid jpeg/png/webp signature
- WHEN it is uploaded
- THEN the API MUST reject it (`415`/`400`) and MUST NOT store it

#### Scenario: Real image accepted

- GIVEN a genuine png upload from an authorized caller
- WHEN it is uploaded
- THEN it is stored and a URL is returned

### Requirement: Upload size limit

The system MUST enforce a maximum upload size per file; an oversize upload MUST be rejected with `413` before storage.

Traces: explore Axis-6 (any size) · proposal upload-and-cors

#### Scenario: Oversize rejected

- GIVEN a file larger than the configured limit
- WHEN uploaded
- THEN the API MUST respond `413`

### Requirement: Safe Content-Disposition

Stored/served objects MUST set `Content-Disposition` such that images render inline appropriately and uploaded content is not served in a way that triggers execution/download of a mislabeled type.

Traces: explore Axis-6 · proposal upload-and-cors

#### Scenario: Served image carries disposition

- GIVEN an allowed image object
- WHEN it is served
- THEN the response sets an explicit `Content-Disposition`

### Requirement: Authenticated write and delete, public read

Upload and delete of objects MUST require authentication plus the appropriate owner/admin role. The bucket policy MUST keep public **read** (`s3:GetObject`) so listing images stay publicly viewable, and MUST NOT grant public write/delete.

Traces: explore Axis-6 (public Principal; anonymous delete) · proposal upload-and-cors

#### Scenario: Anonymous upload blocked

- GIVEN an unauthenticated request
- WHEN `POST /api/imagenes/upload`
- THEN the API MUST respond `401`

#### Scenario: Public read preserved

- GIVEN a stored listing image
- WHEN an anonymous client GETs it
- THEN it MUST be readable (`200`)
