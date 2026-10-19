import { describe, expect, it, vi } from 'vitest';
import { UserRegistrationService } from '../src/services/user-registration.service';
import { TenantQueryError } from '../src/services/crm-catalogs/tenant-query.client';
const session={instance:'tenant-test',userId:1,role:'ADMIN'};
const columns=['NOME','LOGIN','SENHA','NIVEL'].map(COLUMN_NAME=>({COLUMN_NAME,COLUMN_TYPE:COLUMN_NAME==='NIVEL'?"enum('ATIVO','ADMIN')":'varchar(255)',IS_NULLABLE:'YES',COLUMN_DEFAULT:null,EXTRA:''}));
columns.unshift({COLUMN_NAME:'CODIGO',COLUMN_TYPE:'int',IS_NULLABLE:'NO',COLUMN_DEFAULT:null,EXTRA:''});
describe('user registration request boundaries',()=>{
  it('checks admin and tenant before any schema or user read',async()=>{
    const query=vi.fn(),service=new UserRegistrationService(query);
    await expect(service.schema({...session,role:'ATIVO'})).rejects.toMatchObject({status:403});
    await expect(service.schema({...session,instance:''})).rejects.toMatchObject({status:401});
    expect(query).not.toHaveBeenCalled();
  });
  it('returns UNKNOWN without retrying or leaking a password/driver failure after one attempted insert',async()=>{
    const query=vi.fn().mockResolvedValueOnce(columns).mockRejectedValueOnce(new Error('SQL password-sensitive fixture'));
    const service=new UserRegistrationService(query);
    await expect(service.create(session,{NOME:'Test',LOGIN:'new',SENHA:'not-for-logs',NIVEL:'ADMIN'})).rejects.toMatchObject({status:503,code:'CRM_USER_WRITE_UNKNOWN',outcome:'UNKNOWN'});
    expect(query).toHaveBeenCalledTimes(2);
    const error=await new UserRegistrationService(vi.fn().mockResolvedValueOnce(columns).mockRejectedValueOnce(new TenantQueryError('TENANT_QUERY_FAILED'))).create(session,{NOME:'Test',LOGIN:'new',SENHA:'not-for-logs',NIVEL:'ADMIN'}).catch(error=>error);
    expect(JSON.stringify(error)).not.toContain('not-for-logs');expect(error).not.toHaveProperty('cause');
  });
  it('rejects arbitrary SQL identifiers and malformed edit versions before writing',async()=>{
    const query=vi.fn().mockResolvedValue(columns),service=new UserRegistrationService(query);
    await expect(service.create(session,{NOME:'A',LOGIN:'a',SENHA:'x',NIVEL:'ADMIN','users.SENHA':'x'})).rejects.toMatchObject({status:400});
    await expect(service.patch(session,'1',{version:'bad',changes:{NOME:'A'}})).rejects.toMatchObject({status:400});
    expect(query).toHaveBeenCalledTimes(1);
  });
});
