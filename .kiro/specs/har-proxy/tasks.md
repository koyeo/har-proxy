# Implementation Plan

- [x] 1. Update Mock Server to use /proxy path prefix
  - [x] 1.1 Add PROXY_PREFIX constant and getProxyPath helper function
    - Add `const PROXY_PREFIX = '/proxy'` to server module
    - Implement `getProxyPath(originalPath: string): string` function
    - _Requirements: 3.6_
  - [x] 1.2 Update buildEndpointMap to prefix paths with /proxy
    - Modify endpoint key format from `"METHOD:path"` to `"METHOD:/proxy{path}"`
    - _Requirements: 3.1, 3.6_
  - [x] 1.3 Update request handler routing logic
    - Keep dashboard at `/` (internal route)
    - Route `/proxy/*` requests to HAR endpoint matching
    - Return 404 for non-proxy paths that aren't internal routes
    - _Requirements: 3.1, 3.2, 3.6_
  - [x] 1.4 Write property test for proxy path prefix consistency
    - **Property 11: Proxy Path Prefix Consistency**
    - **Validates: Requirements 3.6**
  - [x] 1.5 Update Dashboard to display proxy-prefixed paths
    - Show full `/proxy/*` paths in endpoint list
    - _Requirements: 4.2_
  - [x] 1.6 Update existing tests to use /proxy paths
    - Fix integration tests and server tests to request `/proxy/*` endpoints
    - _Requirements: 3.1, 3.2_

- [x] 2. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement configurable CORS support
  - [x] 3.1 Add CORS types and constants to server module
    - Add `CorsHeaders` interface to types
    - Add `DEFAULT_CORS_HEADERS` constant with Access-Control-Allow-Origin, Methods, Headers
    - Update `ServerConfig` interface to include `cors: boolean`
    - _Requirements: 6.1_
  - [x] 3.2 Implement CORS header injection in request handler
    - Create `applyCorsHeaders()` function to add CORS headers to responses
    - Modify request handler to inject CORS headers when `cors` is enabled
    - Ensure CORS headers are added to all responses (success, 404, errors)
    - _Requirements: 6.1_
  - [x] 3.3 Implement preflight OPTIONS request handling
    - Create `handlePreflightRequest()` function
    - Add OPTIONS method handling in request handler
    - Return 204 status with CORS headers for preflight requests
    - _Requirements: 6.2_
  - [x] 3.4 Write property test for CORS headers by default
    - **Property 12: CORS Headers Included by Default**
    - **Validates: Requirements 6.1**
  - [x] 3.5 Write property test for preflight OPTIONS handling
    - **Property 13: Preflight OPTIONS Request Handling**
    - **Validates: Requirements 6.2**
  - [x] 3.6 Implement --no-cors CLI option
    - Add `cors` option to CLI argument parser (default: true)
    - Pass `cors` config to server creation
    - Update help text to document --no-cors option
    - _Requirements: 6.3, 6.5_
  - [x] 3.7 Ensure original HAR CORS headers preserved when CORS disabled
    - When `cors: false`, skip automatic CORS header injection
    - Preserve any CORS headers from original HAR response headers
    - _Requirements: 6.4_
  - [x] 3.8 Write property test for CORS disabled preserves original headers
    - **Property 14: CORS Disabled Preserves Original Headers**
    - **Validates: Requirements 6.3, 6.4**

- [x] 4. Update README.md documentation
  - [x] 4.1 Update Usage section with --no-cors option
    - Add --no-cors to options table
    - Add example showing --no-cors usage
    - Explain when to use --no-cors (custom CORS handling)
    - _Requirements: 6.5_

- [x] 5. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement query parameter stripping for URL matching
  - [x] 6.1 Add stripQueryParams helper function to server module
    - Implement `stripQueryParams(urlPath: string): string` function
    - Function should remove everything after `?` from the URL path
    - _Requirements: 3.7_
  - [x] 6.2 Update request handler to strip query params before matching
    - Modify the route matching logic to call `stripQueryParams()` on incoming request URL
    - Ensure matching uses only the path portion without query parameters
    - _Requirements: 3.7_
  - [ ]* 6.3 Write property test for query parameter stripping
    - **Property 15: Query Parameter Stripping**
    - **Validates: Requirements 3.7**
  - [ ]* 6.4 Write unit tests for stripQueryParams function
    - Test empty query string
    - Test single query parameter
    - Test multiple query parameters
    - Test URL without query parameters (should return unchanged)
    - _Requirements: 3.7_

- [x] 7. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Previously Completed Tasks (Reference Only)

The following tasks were completed in the initial implementation:

- [x] Set up project structure and dependencies
- [x] Implement HAR Parser module (type definitions, parsing logic, formatEntry)
- [x] Implement Mock Server module (endpoint registry, route matching, HTTP server)
- [x] Implement Dashboard module (grouping logic, HTML generation)
- [x] Implement CLI module (argument parsing, orchestration, logging)
- [x] Final integration and wiring
