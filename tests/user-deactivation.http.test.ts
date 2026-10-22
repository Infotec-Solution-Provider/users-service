import 'express-async-errors';
import express from 'express';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { CatalogError } from '../src/services/crm-catalogs/contract';
const deps=vi.hoisted(()=>({patch:vi.fn(),update:vi.fn(),revoke:vi.fn()}));
vi.mock('../src/middlewares/is-authenticated.middleware',()=>({default:(req:any,_res:any,next:any)=>{req.session={instance:'tenant-a',userId:1,role:'ADMIN'};next()}}));
vi.mock('../src/services/users.service',()=>({default:{update:deps.update,getById:async()=>({CODIGO:7,ATIVO:'NAO'})}}));
vi.mock('../src/services/auth.service',()=>({default:{revokeUserSessions:deps.revoke}}));
vi.mock('../src/services/user-registration.service',()=>({default:{patch:deps.patch}}));
import users from '../src/controllers/users.controller';
import registration from '../src/controllers/user-registration.controller';
describe('inactivation rejects before revoking sessions across all public routes',()=>{
 let server:ReturnType<ReturnType<typeof express>['listen']>,url:string;
 beforeAll(async()=>{const app=express();app.use(express.json());app.use('/api',users.router);app.use('/api',registration);server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));url='http://127.0.0.1:'+(server.address() as any).port;});
 afterAll(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 beforeEach(()=>{vi.clearAllMocks();});
 it.each([['PATCH','/api/users/7',{ATIVO:'NAO',SENHA:'changed'}],['DELETE','/api/users/7',undefined],['PATCH','/api/crm/user-registration/7',{changes:{ATIVO:'NAO'},version:'a'.repeat(64)}]])('preserves sessions for blocked %s %s',async(method,path,body)=>{
  deps.update.mockRejectedValue(new CatalogError(409,'CRM_USER_PENDING_AGENDA','Transfira a agenda.'));deps.patch.mockRejectedValue(new CatalogError(409,'CRM_USER_PENDING_AGENDA','Transfira a agenda.'));
  const response=await fetch(url+path,{method:method as string,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(response.status).toBe(409);expect((await response.json()).code).toBe('CRM_USER_PENDING_AGENDA');expect(deps.revoke).not.toHaveBeenCalled();
 });
 it('revokes sessions after a legacy inactive flag accepted case-insensitively by MySQL',async()=>{
  deps.update.mockResolvedValue(undefined);deps.revoke.mockResolvedValue(undefined);
  const response=await fetch(url+'/api/users/7',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({ativo:'nao'})});expect(response.status).toBe(200);expect(deps.revoke).toHaveBeenCalledWith('tenant-a',7);
 });
});
