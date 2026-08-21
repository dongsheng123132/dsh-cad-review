# Security policy

The DSH tools read only explicit workspace-relative `.dxf` files. Traversal, symlink escape, non-files, binary input, and oversized files fail closed. The plugin never executes drawing content and starts no subprocess.

The MCP server is in-memory and proof-only. It has no filesystem or network API and writes no artifacts. Both surfaces redact `TEXT` and `MTEXT` bodies as SHA-256 plus length; malformed numeric tokens are also hashed rather than copied. Reports retain source hashes, entity handle/index, layer, line range, geometry and rule identifiers.

A passing deterministic review is not professional engineering approval, authorship proof, or evidence that unsupported entities were checked. Project owners remain responsible for policy suitability and independent review.

Report vulnerabilities privately through GitHub Security Advisories.
