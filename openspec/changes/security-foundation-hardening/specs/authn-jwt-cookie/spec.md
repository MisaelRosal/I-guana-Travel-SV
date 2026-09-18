# authn-jwt-cookie Specification

## Purpose

Session contract: a signed, short-lived JWT carried in an `HttpOnly`/`SameSite` cookie, CSRF protection via a double-submit token, and a credentials-aware CORS allowlist. Realizes proposal capability `api-authn`. Traces: explore Axis-1 (AuthN absent), decisions D2 (JWT+cookie+CSRF), D3 (no refresh).

## Requirements

### Requirement: Auth cookie issuance

The system MUST issue a signed, short-lived JWT containing `sub` (user id) and `rol` claims on successful login and registration, delivered ONLY in an `HttpOnly`, `SameSite=Lax` (or stricter) cookie. The token MUST NOT be returned in the response body. Access-token TTL MUST be short; the system MUST NOT implement refresh tokens in this change.

Traces: explore Axis-1 · decision D2 · proposal api-authn

#### Scenario: Login sets HttpOnly cookie

- GIVEN valid credentials for an existing user
- WHEN `POST /api/auth/login` succeeds
- THEN the response sets a JWT auth cookie flagged `HttpOnly` and `SameSite`
- AND the response body MUST NOT contain the raw JWT

#### Scenario: Register issues the same session

- GIVEN a new valid `RegistroRequest`
- WHEN `POST /api/auth/register` creates the user
- THEN the same HttpOnly JWT auth cookie is set for the new `sub` and `rol`

#### Scenario: Tampered or expired token rejected

- GIVEN a request carrying a forged, altered-signature, or expired auth cookie
- WHEN it hits any protected endpoint
- THEN the API MUST respond `401`

### Requirement: Session rehydration endpoint

The system MUST expose `GET /api/auth/me` that returns the authenticated identity (id, name, email, rol) derived from the cookie, and MUST respond `401` when no valid cookie is present.

Traces: explore Axis-1 · proposal api-authn

#### Scenario: Me with active cookie

- GIVEN a request carrying a valid auth cookie
- WHEN `GET /api/auth/me`
- THEN `200` with the caller's identity and role

#### Scenario: Me without cookie

- GIVEN an anonymous request
- WHEN `GET /api/auth/me`
- THEN `401`

### Requirement: Logout clears the session

The system MUST provide a logout that clears (expires) the auth cookie so subsequent protected calls are unauthenticated.

Traces: explore Axis-1 · proposal api-authn

#### Scenario: Logout then protected call

- GIVEN an authenticated session
- WHEN the client calls logout
- AND then calls a protected endpoint with the (now-cleared) cookie
- THEN the call MUST receive `401`

### Requirement: CSRF double-submit contract

For state-changing requests (POST/PUT/PATCH/DELETE), the system MUST require a CSRF token: a non-`HttpOnly` cookie readable by the SPA plus a matching `X-CSRF-Token` request header. The server MUST validate the header equals the cookie value bound to the authenticated session, and MUST reject a missing or mismatched token. `GET` requests MUST NOT require the CSRF token.

Traces: decision D2 (CSRF) · proposal api-authn

#### Scenario: State change without CSRF header

- GIVEN a request with a valid auth cookie but no `X-CSRF-Token` header
- WHEN it issues `POST /api/reserva`
- THEN the API MUST respond `400` or `403` (CSRF rejected)

#### Scenario: Correct CSRF token accepted

- GIVEN a valid auth cookie and a matching `X-CSRF-Token` header
- WHEN the state change is issued
- THEN the request passes the CSRF check

### Requirement: Credentials-aware CORS allowlist

The system MUST replace wildcard CORS with an explicit origin allowlist using `AllowCredentials` (never `AllowAnyOrigin` together with credentials). The allowlist MUST include exactly the dev/preview origins and read a production origin from configuration: dev SPA `http://localhost:5173`, local API origin (unified port, see `secrets-config-hygiene`), docker/preview `http://localhost`, and a `CORS__ALLOWED_ORIGINS` env placeholder for production. Requests from non-allowlisted origins MUST NOT receive CORS allow headers.

Traces: explore Axis-6 (CORS wildcard) · decision CORS allowlist · proposal api-authn

#### Scenario: Allowlisted origin with credentials

- GIVEN an origin in the allowlist
- WHEN a credentialed request is made
- THEN the response echoes that exact origin with `Access-Control-Allow-Credentials: true`

#### Scenario: Disallowed origin

- GIVEN `http://evil.example`
- WHEN it requests a protected endpoint
- THEN the response MUST NOT include an allow CORS origin header
