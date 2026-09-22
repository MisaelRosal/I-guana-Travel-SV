# authz-roles-ownership Specification

## Purpose

Server-side role and ownership enforcement replacing client-side gates. Realizes proposal capability `api-authz`. Traces: explore Axis-2 (no authorization), extra findings (anonymous `verificacion`, mass-assignment `registrar`, anonymous deletes), decision (server-side role gates).

## Requirements

### Requirement: Public read, protected write

Read-only catalog endpoints (`GET` on publicaciones listing, departamentos, municipios, categorias) MAY remain anonymous. Every mutating endpoint MUST require a valid authenticated session (`401` when absent) and MUST pass the role/ownership matrix below (`403` when authenticated but not permitted).

Traces: explore Axis-2 · proposal api-authz

#### Scenario: Anonymous mutation blocked

- GIVEN an unauthenticated request
- WHEN `DELETE /api/publicacione/{id}`
- THEN the API MUST respond `401`

### Requirement: Host verification is admin-only

`PUT /api/anfitrione/{id}/verificacion` MUST be restricted to the `admin` role. Any other role MUST be rejected.

Traces: explore extra-finding (anonymous verificacion) · proposal api-authz

#### Scenario: Non-admin flips verification

- GIVEN an authenticated `usuario` or `anfitrion` token
- WHEN it calls `PUT /api/anfitrione/{id}/verificacion`
- THEN the API MUST respond `403`

#### Scenario: Admin verifies host

- GIVEN an authenticated `admin` token and a valid `X-CSRF-Token`
- WHEN it calls `PUT /api/anfitrione/{id}/verificacion`
- THEN the API MUST apply the change and respond `2xx`

### Requirement: Role changes are admin-only

Any endpoint that changes a `usuario.rol` MUST require `admin`. The host self-registration path (`POST /api/anfitrione/registrar`) is the only non-admin route that may set `rol=anfitrion`, and it MUST set the role for the caller identified by the token, never for a body-supplied id.

Traces: explore extra-finding (mass-assignment registrar) · proposal api-authz

#### Scenario: Promote arbitrary user is rejected

- GIVEN an authenticated caller with `rol=usuario`
- WHEN it posts `POST /api/anfitrione/registrar` with a body `UsuarioId` of a different user
- THEN the API MUST NOT promote that other user; the request is bound to the token `sub`

### Requirement: Registrar binds identity from the token

`POST /api/anfitrione/registrar` MUST take `UsuarioId` from the authenticated token's `sub` and MUST NOT read `UsuarioId` from the request body. The created host row MUST link to that same user and MUST set that user's `rol=anfitrion`.

Traces: explore extra-finding · decision (close mass-assignment) · proposal api-authz

#### Scenario: Self-registration

- GIVEN an authenticated `usuario` with valid CSRF
- WHEN it calls `POST /api/anfitrione/registrar` without a body `UsuarioId`
- THEN a host row is created for the caller's `sub` and that user's role becomes `anfitrion`

#### Scenario: Unauthenticated registrar

- GIVEN an anonymous request
- WHEN `POST /api/anfitrione/registrar`
- THEN `401`

### Requirement: Publication ownership gate

Create, edit, and delete of a publication MUST be permitted to the owning host (the authenticated user whose `Anfitrione.UsuarioId == sub` owns the publication) or to an `admin`. All others MUST receive `403`.

Traces: explore Axis-2 · decision (server gates) · proposal api-authz

#### Scenario: Non-owner host edits another's publication

- GIVEN host A authenticated
- WHEN it edits or deletes a publication owned by host B
- THEN the API MUST respond `403`

### Requirement: Host and image destructive routes authenticated

`DELETE /api/anfitrione/{id}`, `DELETE /api/imagenes/{fileName}`, and `POST /api/imagenes/upload` MUST require authentication and the appropriate owner/admin role.

Traces: explore extra-findings (anonymous deletes/upload) · proposal api-authz

#### Scenario: Anonymous asset delete

- GIVEN an unauthenticated request
- WHEN `DELETE /api/imagenes/{fileName}`
- THEN the API MUST respond `401`
