import { describe, expect, it, vi, beforeEach } from 'vitest';
const single=vi.hoisted(()=>vi.fn());
vi.mock('../src/services/crm-catalogs/tenant-query.client',async original=>({...await original<any>(),executeQuery:single}));
import { assertNoPendingCrmAgenda, requestsDeactivation, noPendingCrmAgenda } from '../src/services/user-deactivation.guard';
import { UserRegistrationService } from '../src/services/user-registration.service';
import users from '../src/services/users.service';

const session={instance:'tenant-a',userId:1,role:'ADMIN'};
const row={CODIGO:7,NOME:'Fixture',LOGIN:'fixture',SENHA:'private-fixture',NIVEL:'ATIVO',ATIVO:'SIM'};
const columns=Object.keys(row).map(COLUMN_NAME=>({COLUMN_NAME,COLUMN_TYPE:COLUMN_NAME==='NIVEL'?"enum('ATIVO','ADMIN')":COLUMN_NAME==='ATIVO'?"enum('SIM','NAO')":COLUMN_NAME==='CODIGO'?'int':'varchar(255)',IS_NULLABLE:'YES',COLUMN_DEFAULT:null,EXTRA:''}));
beforeEach(()=>{single.mockReset();});
describe('pending CRM agenda guards',()=>{
 it.each(['ATIVO','ativo','AtIvO'])('detects MySQL-compatible inactive flag through %s',key=>{expect(requestsDeactivation({[key]:' nao '})).toBe(true);expect(requestsDeactivation({[key]:'SIM'})).toBe(false)});
 it('limits the pending lookup to the selected operator and session tenant',async()=>{const query=vi.fn().mockResolvedValue([{pending:1}]);await expect(assertNoPendingCrmAgenda(query,'a',7)).rejects.toMatchObject({status:409,code:'CRM_USER_PENDING_AGENDA'});expect(query).toHaveBeenCalledWith('a',expect.stringContaining("CONCLUIDO='NAO' LIMIT 1"),[7]);});
 for(const scenario of ['pending','clear','race','unknown','noop-pending'])it('versioned deactivation '+scenario,async()=>{
  let current={...row,...(scenario==='noop-pending'?{ATIVO:'NAO'}:{})},pending=scenario==='pending'||scenario==='noop-pending';
  const query=vi.fn(async(_instance:string,sql:string,params:unknown[])=>{
   if(sql.includes('information_schema'))return columns;
   if(sql.startsWith('SELECT 1 AS pending'))return pending?[{pending:1}]:[];
   if(sql.startsWith('SELECT'))return [{...current}];
   expect(sql).toContain(noPendingCrmAgenda);expect(params.at(-1)).toBe(7);
   if(scenario==='unknown')throw new Error('private driver failure');
   if(scenario==='race'){pending=true;return {affectedRows:0}}
   current.ATIVO='NAO';return {affectedRows:1};
  });
  const service=new UserRegistrationService(query as any),before=await service.detail(session,'7');
  const write=service.patch(session,'7',{version:before.version,changes:{ATIVO:'NAO'}});
  if(scenario==='clear')expect((await write).record['ATIVO']).toBe('NAO');else await expect(write).rejects.toMatchObject(scenario==='unknown'?{status:503,outcome:'UNKNOWN'}:{status:409,code:'CRM_USER_PENDING_AGENDA'});
  const writes=query.mock.calls.filter(call=>call[1].startsWith('UPDATE'));expect(writes.length).toBe(['pending','noop-pending'].includes(scenario)?0:1);
 });
 it.each(['pending','clear','race','unknown'])('legacy deactivation %s',async scenario=>{
  let pending=scenario==='pending';single.mockImplementation(async(_instance,sql)=>{if(sql.startsWith('SELECT 1 AS pending'))return pending?[{pending:1}]:[];if(scenario==='unknown')throw new Error('driver');if(scenario==='race'){pending=true;return{affectedRows:0}}return{affectedRows:1}});
  const result=users.update('tenant-b',7,{ativo:'nao'} as any);
  if(scenario==='clear')await result;else await expect(result).rejects.toMatchObject(scenario==='unknown'?{status:503,outcome:'UNKNOWN'}:{status:409,code:'CRM_USER_PENDING_AGENDA'});
  const writes=single.mock.calls.filter(call=>call[1].startsWith('UPDATE'));expect(writes.length).toBe(scenario==='pending'?0:1);
  for(const call of writes){expect(call[0]).toBe('tenant-b');expect(call[1]).toContain(noPendingCrmAgenda);expect(call[2].at(-1)).toBe(7)}
 });
});
