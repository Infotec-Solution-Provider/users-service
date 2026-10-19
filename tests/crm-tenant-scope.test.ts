import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { crmTenantAuthentication } from '../src/middlewares/crm-tenant-scope.middleware';
vi.mock('../src/middlewares/is-authenticated.middleware',()=>({default:(_req:unknown,_res:unknown,next:(error?:unknown)=>void)=>next()}));
describe('CRM tenant context guard',()=>{
  const write=vi.fn();let server:ReturnType<ReturnType<typeof express>['listen']>,url:string;
  beforeAll(async()=>{
    const app=express();
    app.post('/write',crmTenantAuthentication((req,_res,next)=>{req.session={instance:'tenant-b',userId:1,role:'ADMIN'} as any;next()}),(_req,res)=>{write();res.json({ok:true})});
    server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));url='http://127.0.0.1:'+(server.address() as any).port;
  });
  afterAll(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  it('rejects a stale form hint before a write even when the new token is valid',async()=>{
    const response=await fetch(url+'/write',{method:'POST',headers:{'x-crm-instance':'tenant-a'}});expect(response.status).toBe(409);expect((await response.json()).code).toBe('CRM_TENANT_CHANGED');expect(write).not.toHaveBeenCalled();
  });
  it('accepts a matching context without using the hint to choose a database',async()=>{
    const response=await fetch(url+'/write',{method:'POST',headers:{'x-crm-instance':'tenant-b'}});expect(response.status).toBe(200);expect(write).toHaveBeenCalledTimes(1);
  });
});
