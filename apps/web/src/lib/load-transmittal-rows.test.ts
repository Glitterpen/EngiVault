// @vitest-environment node
import {expect, it, vi} from "vitest";
import {loadTransmittalRows} from "./load-transmittal-rows";
vi.mock("server-only", () => ({}));
it("loads complete issue history even when server pages are smaller than requested", async () => {
  const all = [1,2,3,4,5];
  const read = vi.fn(async (offset: number) => ({data: all.slice(offset,offset+2), count:5, error:null}));
  expect((await loadTransmittalRows<number>(read)).data).toEqual(all);
  expect(read.mock.calls.map(([offset]) => offset)).toEqual([0,2,4]);
});
it.each([
  {data:null,count:null,error:new Error("unavailable")},
  {data:[],count:10,error:null},
  {data:[],count:null,error:null},
])("rejects incomplete history rather than presenting it as unissued", async (page) => {
  await expect(loadTransmittalRows(async () => page)).rejects.toThrow();
});
it("rejects later-page errors", async () => {
  await expect(loadTransmittalRows(async offset => offset ? {data:null,error:true,count:null} : {data:[1],error:null,count:2})).rejects.toThrow();
});
