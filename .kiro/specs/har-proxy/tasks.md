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

## Previously Completed Tasks (Reference Only)

The following tasks were completed in the initial implementation:

- [x] Set up project structure and dependencies
- [x] Implement HAR Parser module (type definitions, parsing logic, formatEntry)
- [x] Implement Mock Server module (endpoint registry, route matching, HTTP server)
- [x] Implement Dashboard module (grouping logic, HTML generation)
- [x] Implement CLI module (argument parsing, orchestration, logging)
- [x] Final integration and wiring
