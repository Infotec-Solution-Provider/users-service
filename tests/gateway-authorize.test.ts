import "express-async-errors";
import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../src/services/webrtc-settings.service", () => ({ default: { get: mocks.get } }));
vi.mock("../src/services/users.service", () => ({ default: {} }));
vi.mock("../src/services/auth.service", () => ({ default: {} }));
vi.mock("../src/operator-features/rollout", () => ({ assertOperatorFeature: (p: {instance: string; userId: number}) => { if (p.instance !== "odim" || p.userId !== 534) throw Error("DENIED"); }, OperatorFeatureError: Error }));
import router from "../src/controllers/webrtc.controller";
import { issueGatewayToken, readGatewayEnvironment } from "../src/services/telephony-gateway";
const values = { TELEPHONY_GATEWAY_WSS_URL: "wss://lux.infotecrs.inf.br/telephony-gw", TELEPHONY_GATEWAY_TOKEN_SECRET: "t".repeat(64), TELEPHONY_GATEWAY_API_KEY: "k".repeat(64), TELEPHONY_GATEWAY_ALLOWED_NETWORKS: "131.161.3.106/32" };
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
async function request(token?: string, key = values.TELEPHONY_GATEWAY_API_KEY, query = false) {
  for (const [name,value] of Object.entries(values)) vi.stubEnv(name,value);
  const app=express(); app.use('/api',router); const server=app.listen(0,'127.0.0.1'); await new Promise<void>(r=>server.once('listening',r));
  try { const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/telephony/gateway/authorize${query?'?token='+token:''}`,{headers:{'x-telephony-gateway-key':key,...(token&&!query?{'x-telephony-gateway-token':token}:{})}});return{status:response.status,body:await response.text(),cache:response.headers.get('cache-control')}; }
  finally { await new Promise<void>(r=>server.close(()=>r())); }
}
const claims={instance:'odim',userId:534,sipUser:'2710',host:'131.161.3.106',port:5060};
const token=(patch={})=>issueGatewayToken(readGatewayEnvironment(values)!,{...claims,...patch});
describe('gateway authorization over headers',()=>{
  it('authorizes exactly the bound operator/PBX and never returns a SIP password or token',async()=>{
    mocks.get.mockResolvedValue({enabled:true,mode:'gateway',pbxAddress:'131.161.3.106:5060'});
    const response=await request(token()); expect(response).toMatchObject({status:200,body:'2710:131.161.3.106:5060'});expect(response.cache).toContain('no-store');expect(mocks.get).toHaveBeenCalledExactlyOnceWith('odim');
  });
  it('denies wrong key, signatures, principals, destinations and query-string tokens before settings lookup',async()=>{
    expect((await request(token(),'wrong')).status).toBe(403);
    expect((await request('invalid-token')).status).toBe(403);
    expect((await request(token({userId:535}))).status).toBe(403);
    expect((await request(token({instance:'another'}))).status).toBe(403);
    expect((await request(token({host:'127.0.0.1'}))).status).toBe(403);
    expect((await request(token(),values.TELEPHONY_GATEWAY_API_KEY,true)).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each([{enabled:false,mode:'gateway',pbxAddress:'131.161.3.106:5060'},{enabled:true,mode:'direct',pbxAddress:'131.161.3.106:5060'},{enabled:true,mode:'gateway',pbxAddress:'131.161.3.106:5080'}])('rejects disabled or changed settings',async settings=>{mocks.get.mockResolvedValue(settings);expect((await request(token())).status).toBe(403);});
});
