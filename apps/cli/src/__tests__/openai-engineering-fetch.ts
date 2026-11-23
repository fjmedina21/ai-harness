/** Trusted subprocess preload: all HTTP is mocked; no real key/network is used. */
const scenario = process.env.HARNESS_TEST_OPENAI_SCENARIO ?? "valid";
globalThis.fetch = async (url, init) => {
  if (String(url) !== "https://api.openai.com/v1/responses") throw new Error("Unexpected mock endpoint");
  if (scenario === "hang") {
    process.stderr.write("MOCK_PROVIDER_READY\n");
    return new Promise<Response>((_, reject) => {
      const stop = () => reject(new Error("PRIVATE mock cancelled"));
      init?.signal?.addEventListener("abort", stop, { once: true });
      if (init?.signal?.aborted) stop();
    });
  }
  const body = JSON.parse(String(init?.body));
  if (body.model !== "fixture-model" || body.max_output_tokens !== 512 || body.store !== false) throw new Error("Invalid native request");
  if (String(init?.body).includes("PRIVATE_LOCAL_ENV") || String(init?.body).includes("fixture-not-real")) throw new Error("Unexpected context leak");
  if (scenario === "quota") return Response.json({ error: { code: "insufficient_quota", message: "PRIVATE upstream error" } }, { status: 429 });
  const input = JSON.parse(body.input);
  let output: Record<string, unknown> = { summary: "Synthetic plan/review; no code was executed" };
  if (input.role === "backend-developer") {
    output = { summary: "Synthetic value replacement", proposal: { baseRevision: input.snapshot.digest, changes: [{ path: scenario === "bad_path" ? "../escape.ts" : "value.ts", operation: "replace",
      baseHash: input.snapshot.files[0].hash, content: scenario === "wrong_semantics" ? "export const value = 3;\n" : "export const value = 2;\n", resultHash: null }] } };
  }
  return Response.json({ status: scenario === "incomplete" ? "incomplete" : "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: scenario === "malformed" ? "PRIVATE ```invalid```" : JSON.stringify(output) }] }],
    ...(scenario === "unknown_usage" ? {} : { usage: { input_tokens: 100, output_tokens: 20 } }) });
};
