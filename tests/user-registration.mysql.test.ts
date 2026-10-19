import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { UserRegistrationService } from '../src/services/user-registration.service';
import { TenantQueryError, type ExecuteQuery } from '../src/services/crm-catalogs/tenant-query.client';
const enabled=Boolean(process.env['USER_REGISTRATION_MYSQL_TEST_PORT']);
describe.skipIf(!enabled)('user registration with real MySQL and legacy defaults',()=>{
  const databases=['a','b'].map(suffix=>'crm_registration_users_'+randomBytes(5).toString('hex')+'_'+suffix);
  const connections=new Map<string,any>();let control:any;
  const session=(instance:string)=>({instance,userId:1,role:'ADMIN'});
  const execute:ExecuteQuery=async<T>(instance,sql,values):Promise<T>=>{
    try{return(await connections.get(instance).query(sql,values))[0]}catch(error:any){if(error.code==='ER_DUP_ENTRY')throw new TenantQueryError('TENANT_DUPLICATE_KEY');throw error}
  };
  const service=new UserRegistrationService(execute);
  beforeAll(async()=>{
    const port=Number(process.env['USER_REGISTRATION_MYSQL_TEST_PORT']);if(!Number.isInteger(port)||port<1024||[3306,3307].includes(port))throw new Error('Disposable loopback fixture only');
    const require=createRequire(import.meta.url),mysql=require(process.env['USER_REGISTRATION_MYSQL_MODULE']||'mysql2/promise');
    const config={host:'127.0.0.1',port,user:'root',password:'',dateStrings:true};
    control=await mysql.createConnection(config);
    for(const [index,db] of databases.entries()){
      await control.query(`CREATE DATABASE \`${db}\` CHARACTER SET latin1`);
      const connection=await mysql.createConnection({...config,database:db,charset:index?'utf8mb4_unicode_ci':'latin1_swedish_ci'});connections.set(db,connection);
      await connection.query("SET SESSION sql_mode='NO_ENGINE_SUBSTITUTION'");
      await connection.query(`CREATE TABLE operadores (CODIGO INT PRIMARY KEY DEFAULT 0,NOME VARCHAR(255),LOGIN VARCHAR(255) UNIQUE,SENHA VARCHAR(255),EMAIL VARCHAR(255),NIVEL ENUM('ATIVO','RECEP','AMBOS','ADMIN'${index?'':",'EXTERNO'"}) DEFAULT NULL,ATIVO ENUM('SIM','NAO') DEFAULT 'SIM',SETOR INT DEFAULT 0,CODIGO_ERP VARCHAR(255) UNIQUE DEFAULT '',EXPIRA_EM DATE DEFAULT '0000-00-00',ULTIMO_LOGIN_INI DATETIME DEFAULT '0000-00-00 00:00:00',ULTIMO_LOGIN_FIM DATETIME DEFAULT '0000-00-00 00:00:00',DATACAD DATETIME DEFAULT '0000-00-00 00:00:00',EDITA_CONTATOS ENUM('SIM','NAO') DEFAULT NULL,DESATIVAR_EXIBICAO_WHATS TINYINT DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=latin1`);
      await connection.query("SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,NO_ENGINE_SUBSTITUTION'");
    }
  },30000);
  afterAll(async()=>{for(const connection of connections.values())await connection.end();if(control){for(const db of databases){if(!/^crm_registration_users_[a-f0-9]{10}_[ab]$/.test(db))throw new Error('Unsafe cleanup');await control.query(`DROP DATABASE IF EXISTS \`${db}\``)}await control.end()}});
  for(const db of databases){
    it('creates a real returned user without zero date failures or password disclosure ('+db.slice(-1)+')',async()=>{
      const result=await service.create(session(db),{NOME:'Usuário café',LOGIN:'operator',SENHA:'local-fixture-only',NIVEL:'ADMIN'});
      expect(result.record['CODIGO']).toBe(1);expect(result.record['NOME']).toBe('Usuário café');expect(result.record['EXPIRA_EM']).toBeNull();expect(result.record['CODIGO_ERP']).toBeNull();expect(result.record).not.toHaveProperty('SENHA');expect(JSON.stringify(result)).not.toContain('local-fixture-only');
      expect((await connections.get(db).query('SELECT SENHA,ULTIMO_LOGIN_INI,DATACAD FROM operadores WHERE CODIGO=1'))[0][0]).toMatchObject({SENHA:'local-fixture-only',ULTIMO_LOGIN_INI:null});
    });
    it('uses one atomic allocation and handles duplicates without retry ('+db.slice(-1)+')',async()=>{
      const created=await service.create(session(db),{NOME:'Outro',LOGIN:'operator2',SENHA:'second-fixture-only',NIVEL:'ATIVO'});expect(created.record['CODIGO']).toBe(2);
      await expect(service.create(session(db),{NOME:'Duplicate',LOGIN:'operator2',SENHA:'unused',NIVEL:'ATIVO'})).rejects.toMatchObject({status:409,code:'CRM_USER_DUPLICATE',outcome:'UNKNOWN'});
      expect((await connections.get(db).query('SELECT COUNT(*) AS n FROM operadores'))[0][0].n).toBe(2);
    });
    it('edits accents with CAS, invalidates stale versions and keeps passwords private ('+db.slice(-1)+')',async()=>{
      const before=await service.detail(session(db),'1');
      const updated=await service.patch(session(db),'1',{version:before.version,changes:{NOME:'AÇÃO café',EMAIL:null}});expect(updated.record['NOME']).toBe('AÇÃO café');
      await expect(service.patch(session(db),'1',{version:before.version,changes:{NOME:'old draft'}})).rejects.toMatchObject({status:409,code:'CRM_USER_CHANGED'});
      await connections.get(db).query("UPDATE operadores SET SENHA='external-fixture-change' WHERE CODIGO=1");
      await expect(service.patch(session(db),'1',{version:updated.version,changes:{EMAIL:'new@fixture.local'}})).rejects.toMatchObject({status:409});
      expect((await service.detail(session(db),'1')).record).not.toHaveProperty('SENHA');
    });
    it('rejects unsupported fields, roles and blank password changes ('+db.slice(-1)+')',async()=>{
      const before=await service.detail(session(db),'1');
      await expect(service.patch(session(db),'1',{version:before.version,changes:{HORARIO:7}})).rejects.toMatchObject({status:400});
      await expect(service.patch(session(db),'1',{version:before.version,changes:{SENHA:''}})).rejects.toMatchObject({status:400});
      await expect(service.create(session(db),{NOME:'Bad',LOGIN:'bad',SENHA:'unused',NIVEL:'SUPERADMIN'})).rejects.toMatchObject({status:400});
      await expect(service.detail({...session(db),role:'ATIVO'},'1')).rejects.toMatchObject({status:403});
    });
  }
  it('exposes only tenant supported roles and keeps equal IDs isolated',async()=>{
    expect((await service.schema(session(databases[0]!))).fields.find(field=>field.name==='NIVEL')!.options).toContain('EXTERNO');
    expect((await service.schema(session(databases[1]!))).fields.find(field=>field.name==='NIVEL')!.options).not.toContain('EXTERNO');
    const row=await service.detail(session(databases[0]!), '1');await expect(service.patch(session(databases[1]!),'1',{version:row.version,changes:{NOME:'Cross tenant'}})).rejects.toMatchObject({status:409});
  });
});
