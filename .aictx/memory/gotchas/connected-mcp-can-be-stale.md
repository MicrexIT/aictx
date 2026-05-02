# Connected MCP can be stale

The MCP server connected to an agent client can lag behind the project-local source or package. If `mcp__aictx__load_memory` fails with `AICtxSchemaValidationFailed` on v2 storage while `pnpm exec tsx src/cli/main.ts load ...` and the project-local MCP integration tests pass, treat the connected server as stale until it is rebuilt or restarted rather than debugging `src/mcp/tools/load-memory.ts` first.
