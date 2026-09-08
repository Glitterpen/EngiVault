// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {GET} from "./route";
import {processNextDocumentRevision} from "@/lib/processor";
vi.mock("@/lib/processor",()=>({processNextDocumentRevision:vi.fn()}));
const secret="test-cron-secret-not-a-real-secret";
const request=(value?:string)=>new Request("https://example.test/api/internal/cron/document-processing",{headers:value?{authorization:value}:{}});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("CRON_SECRET",secret);vi.mocked(processNextDocumentRevision).mockResolvedValue("processed");});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it.each([undefined,"Bearer incorrect","Bearer "+"x".repeat(secret.length)])("rejects unauthorized calls (%s)",async(value)=>{
  expect((await GET(request(value))).status).toBe(401);expect(processNextDocumentRevision).not.toHaveBeenCalled();
});
it("fails closed if cron credentials are missing",async()=>{
  vi.stubEnv("CRON_SECRET","");expect((await GET(request("Bearer "))).status).toBe(401);expect(processNextDocumentRevision).not.toHaveBeenCalled();
});
it.each(["idle","processed","retrying","failed"])("processes one bounded queue job with outcome %s",async(state)=>{
  vi.mocked(processNextDocumentRevision).mockResolvedValue(state);
  const result=await GET(request(`Bearer ${secret}`));expect(await result.json()).toEqual({state});expect(result.headers.get("cache-control")).toBe("no-store");expect(processNextDocumentRevision).toHaveBeenCalledTimes(1);
});
it("surfaces worker outages without leaking private diagnostics",async()=>{
  vi.spyOn(console,"error").mockImplementation(()=>{});vi.mocked(processNextDocumentRevision).mockRejectedValue(new Error("private service details"));
  const result=await GET(request(`Bearer ${secret}`));expect(result.status).toBe(503);expect(JSON.stringify(await result.json())).not.toContain("private");
});
