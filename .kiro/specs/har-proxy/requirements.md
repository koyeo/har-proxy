# Requirements Document

## Introduction

har-proxy is a terminal command-line tool that parses HAR (HTTP Archive) files exported from Chrome and creates a RESTful mock server based on the recorded request data. The tool allows developers to access API data via HTTP requests and provides a visual dashboard to display the supported endpoints.

## Glossary

- **HAR (HTTP Archive)**: A JSON-formatted file that records HTTP interactions between a browser and a website
- **HAR_Parser**: The component responsible for parsing HAR file contents
- **Mock_Server**: A RESTful server that provides HTTP responses based on HAR data
- **Dashboard**: A visual web interface that displays the list of supported endpoints
- **CLI**: Command-line interface, the entry point for user interaction with the har-proxy tool
- **Entry**: A single request/response record in a HAR file

## Requirements

### Requirement 1

**User Story:** As a developer, I want to start the mock server via command line, so that I can quickly replay recorded HTTP interactions.

#### Acceptance Criteria

1. WHEN a user executes `har-proxy <path-to-har-file>` THEN the CLI SHALL parse the specified HAR file and start the Mock_Server
2. WHEN the HAR file path is invalid or the file does not exist THEN the CLI SHALL display an error message indicating the file cannot be found
3. WHEN the HAR file contains invalid JSON format THEN the HAR_Parser SHALL display an error message indicating the parsing failure
4. WHEN the Mock_Server starts successfully THEN the CLI SHALL display the server address and port number
5. WHERE the user specifies a custom port via `--port` option THEN the Mock_Server SHALL listen on the specified port

### Requirement 2

**User Story:** As a developer, I want the tool to parse HAR files correctly, so that all recorded requests can be served by the mock server.

#### Acceptance Criteria

1. WHEN the HAR_Parser receives a valid HAR file THEN the HAR_Parser SHALL extract all request entries including method, URL, headers, and query parameters
2. WHEN the HAR_Parser receives a valid HAR file THEN the HAR_Parser SHALL extract all response entries including status code, headers, and body content
3. WHEN an entry contains base64 encoded response body THEN the HAR_Parser SHALL decode the content correctly
4. WHEN the HAR_Parser completes parsing THEN the HAR_Parser SHALL produce a structured data format suitable for Mock_Server consumption
5. WHEN the HAR_Parser parses entries THEN the HAR_Parser SHALL generate a text representation of each entry for debugging purposes

### Requirement 3

**User Story:** As a developer, I want to access the recorded API responses via HTTP requests, so that I can test my application against the recorded data.

#### Acceptance Criteria

1. WHEN a client sends an HTTP request matching a recorded entry's method and path THEN the Mock_Server SHALL return the corresponding recorded response
2. WHEN a client sends an HTTP request that does not match any recorded entry THEN the Mock_Server SHALL return a 404 status code with an appropriate error message
3. WHEN multiple entries match the same method and path THEN the Mock_Server SHALL return the response from the most recent entry
4. WHEN the recorded response contains specific headers THEN the Mock_Server SHALL include those headers in the response
5. WHEN the recorded response contains a body THEN the Mock_Server SHALL return the exact body content with the correct content-type

### Requirement 4

**User Story:** As a developer, I want to view a dashboard showing all available endpoints, so that I can understand what APIs are supported by the mock server.

#### Acceptance Criteria

1. WHEN the Mock_Server is running THEN the Dashboard SHALL be accessible at the root path `/`
2. WHEN a user visits the Dashboard THEN the Dashboard SHALL display a list of all available endpoints with their HTTP methods
3. WHEN a user visits the Dashboard THEN the Dashboard SHALL display the response status code for each endpoint
4. WHEN a user visits the Dashboard THEN the Dashboard SHALL display the content-type for each endpoint
5. WHEN the endpoint list is displayed THEN the Dashboard SHALL group endpoints by their base path for better organization

### Requirement 5

**User Story:** As a developer, I want the CLI to provide helpful information, so that I can use the tool effectively.

#### Acceptance Criteria

1. WHEN a user executes `har-proxy --help` THEN the CLI SHALL display usage instructions and available options
2. WHEN a user executes `har-proxy --version` THEN the CLI SHALL display the current version number
3. WHEN the Mock_Server is running THEN the CLI SHALL display the number of endpoints loaded from the HAR file
4. WHEN a request is received by the Mock_Server THEN the CLI SHALL log the request method, path, and response status
