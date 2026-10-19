import { createHmac, randomBytes } from "node:crypto";
import { admin, CatalogError, id, object, type Row } from "./crm-catalogs/contract";
import { executeQuery, TenantQueryError, type ExecuteQuery } from "./crm-catalogs/tenant-query.client";

type FieldType = "text" | "password" | "number" | "date" | "select";
export interface UserRegistrationField { name: string; type: FieldType; label: string; group: string; nullable: boolean; maxLength?: number; options?: string[]; requiredOnCreate?: boolean }
interface Column { COLUMN_NAME: string; COLUMN_TYPE: string; IS_NULLABLE: string; COLUMN_DEFAULT: string | null; EXTRA: string }
interface Schema { fields: UserRegistrationField[]; columns: Column[] }
const descriptions: Record<string, [FieldType, string, string]> = {
  NOME:["text","Nome","Identificação"], LOGIN:["text","Login","Acesso"], SENHA:["password","Senha","Acesso"], EMAIL:["text","E-mail","Identificação"],
  NIVEL:["select","Perfil de acesso","Acesso"], ATIVO:["select","Ativo","Acesso"], EXPIRA_EM:["date","Acesso válido até","Acesso"],
  SETOR:["number","Código do setor","Organização"], CODIGO_ERP:["text","Código ERP","Organização"],
  EDITA_CONTATOS:["select","Pode editar contatos","Permissões CRM"], VISUALIZA_COMPRAS:["select","Pode visualizar compras","Permissões CRM"],
  CADASTRO:["select","Edição do cadastro","Permissões CRM"], ALTERA_SENHA:["select","Pode alterar senha","Permissões CRM"],
  AGENDA_LIG:["select","Agenda de ligações","Permissões CRM"], LIGA_REPRESENTANTE:["select","Ligação para representante","Permissões CRM"],
  FILTRA_DDD:["select","Filtrar por DDD","Permissões CRM"], FILTRA_ESTADO:["select","Filtrar por estado","Permissões CRM"],
  DESATIVAR_EXIBICAO_WHATS:["number","Ocultar nas listas de WhatsApp (0 ou 1)","Organização"],
};
const required = new Set(["NOME","LOGIN","SENHA","NIVEL"]);
const quote = (key: string) => `\`${key}\``;
const binary = (column: string) => `CAST(CONVERT(${column} USING utf8mb4) AS BINARY)`;
function invalid(message = "Dados de usuário inválidos."): never { throw new CatalogError(400,"CRM_USER_INVALID",message); }
export class UserRegistrationService {
  // A process restart invalidates old edit versions safely; the key is never sent to clients.
  private readonly versionKey = randomBytes(32);
  constructor(private readonly execute: ExecuteQuery = executeQuery) {}
  private async safe<T>(work:()=>Promise<T>, writing=false):Promise<T>{
    try{return await work()}catch(error){
      if(error instanceof CatalogError)throw error;
      if(error instanceof TenantQueryError && error.code==="TENANT_DUPLICATE_KEY")throw new CatalogError(409,"CRM_USER_DUPLICATE","Login ou código ERP já cadastrado. Recarregue para conferir.",...(writing?["UNKNOWN" as const]:[]));
      throw new CatalogError(503,writing?"CRM_USER_WRITE_UNKNOWN":"CRM_USER_QUERY_FAILED",writing?"Não foi possível confirmar a gravação. Recarregue antes de tentar novamente.":"Não foi possível consultar o usuário.",...(writing?["UNKNOWN" as const]:[]));
    }
  }
  private async metadata(instance:string):Promise<Schema>{
    const columns=await this.execute<Column[]>(instance,"SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='operadores' ORDER BY ORDINAL_POSITION",[]);
    if(!Array.isArray(columns)||columns.length>500||!columns.some(column=>column.COLUMN_NAME==='CODIGO')||columns.some(column=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(column.COLUMN_NAME)))throw new Error('Unsupported users schema');
    const fields:UserRegistrationField[]=[];
    for(const column of columns){
      const spec=descriptions[column.COLUMN_NAME];if(!spec)continue;
      const [type,label,group]=spec;
      const field:UserRegistrationField={name:column.COLUMN_NAME,type,label,group,nullable:column.IS_NULLABLE==='YES',...(required.has(column.COLUMN_NAME)?{requiredOnCreate:true}:{})};
      const length=column.COLUMN_TYPE.match(/^(?:var)?char\((\d+)\)/i);if(length)field.maxLength=Number(length[1]);
      if(type==='select'){
        const options=[...column.COLUMN_TYPE.matchAll(/'([^']*)'/g)].map(match=>match[1]!);
        if(!options.length)throw new Error('Unsupported user option type');field.options=options;
      }
      fields.push(field);
    }
    if([...required].some(name=>!fields.some(field=>field.name===name)))throw new Error('Missing required user columns');
    return {fields,columns};
  }
  private async row(instance:string,schema:Schema,userId:number):Promise<Row|null>{
    const columns=['CODIGO',...schema.fields.map(field=>field.name)];
    const select=columns.map(key=>schema.fields.find(field=>field.name===key)?.type==='date'?`CAST(${quote(key)} AS CHAR) AS ${quote(key)}`:quote(key)).join(',');
    const rows=await this.execute<Row[]>(instance,`SELECT ${select} FROM operadores WHERE CODIGO=? LIMIT 1`,[userId]);
    if(!Array.isArray(rows))throw new Error('Invalid user response');
    const row=rows[0];if(!row)return null;
    if(!Number.isInteger(row['CODIGO'])||columns.some(key=>!Object.hasOwn(row,key)||(!['string','number'].includes(typeof row[key])&&row[key]!==null)))throw new Error('Invalid user values');
    return Object.fromEntries(columns.map(key=>[key,row[key]!])) as Row;
  }
  private version(instance:string,row:Row):string{return createHmac('sha256',this.versionKey).update(JSON.stringify([instance,row])).digest('hex')}
  private response(instance:string,row:Row,schema:Schema){return {record:Object.fromEntries(Object.entries(row).filter(([key])=>key!=='SENHA')),version:this.version(instance,row),fields:schema.fields}}
  private value(field:UserRegistrationField,value:unknown):string|number|null{
    if(value===null){if(!field.nullable||required.has(field.name))return invalid(`Informe ${field.label.toLowerCase()}.`);return null}
    if(field.type==='number'){
      if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>2147483647||(field.name==='DESATIVAR_EXIBICAO_WHATS'&&value>1))return invalid(`${field.label}: número inválido.`);
      return value;
    }
    if(typeof value!=='string')return invalid(`${field.label}: texto inválido.`);
    const text=field.type==='password'?value:value.trim();
    if(field.type==='date'){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||text<'1000-01-01'||Number.isNaN(Date.parse(text+'T00:00:00Z'))||new Date(text+'T00:00:00Z').toISOString().slice(0,10)!==text)return invalid('Data de validade inválida.');
    }else if(field.type==='select'){
      if(!field.options?.includes(text))return invalid(`${field.label}: opção não disponível neste CRM.`);
    }else{
      if([...text].length>(field.maxLength??255)||/[^\u0020-\u007e\u00a0-\u00ff]/.test(text))return invalid(`${field.label}: texto incompatível com o CRM.`);
      if(required.has(field.name)&&!text.length)return invalid(`Informe ${field.label.toLowerCase()}.`);
      if(field.name==='CODIGO_ERP'&&!text.length)return null;
    }
    return text;
  }
  async schema(session:unknown){admin(session);return this.safe(async()=>({fields:(await this.metadata(session.instance)).fields}))}
  async detail(session:unknown,rawId:unknown){admin(session);const userId=id(rawId);return this.safe(async()=>{const schema=await this.metadata(session.instance),row=await this.row(session.instance,schema,userId);if(!row)throw new CatalogError(404,'CRM_USER_NOT_FOUND','Usuário não encontrado.');return this.response(session.instance,row,schema)})}
  async create(session:unknown,input:unknown){
    admin(session);return this.safe(async()=>{
      const schema=await this.metadata(session.instance),data=object(input,schema.fields.map(field=>field.name)),values:Row={};
      for(const field of schema.fields){if(Object.hasOwn(data,field.name))values[field.name]=this.value(field,data[field.name]);else if(field.requiredOnCreate)return invalid(`Informe ${field.label.toLowerCase()}.`)}
      if(!Object.hasOwn(values,'ATIVO'))values['ATIVO']='SIM';
      if(!Object.hasOwn(values,'CODIGO_ERP')&&schema.fields.some(field=>field.name==='CODIGO_ERP'))values['CODIGO_ERP']=null;
      for(const column of schema.columns)if(column.IS_NULLABLE==='YES'&&/^0000/.test(String(column.COLUMN_DEFAULT))&&!Object.hasOwn(values,column.COLUMN_NAME))values[column.COLUMN_NAME]=null;
      if(schema.columns.some(column=>column.COLUMN_NAME==='DATACAD')&&values['DATACAD']===null)delete values['DATACAD'];
      const keys=Object.keys(values),hasDate=schema.columns.some(column=>column.COLUMN_NAME==='DATACAD');
      const result=await this.execute<{affectedRows:number}>(session.instance,`INSERT INTO operadores (CODIGO,${keys.map(quote).join(',')}${hasDate?',DATACAD':''}) SELECT GREATEST(COALESCE(MAX(CODIGO),0),0)+1,${keys.map(()=>'?').join(',')}${hasDate?',UTC_TIMESTAMP()':''} FROM operadores HAVING GREATEST(COALESCE(MAX(CODIGO),0),0)<2147483647`,Object.values(values));
      if(result?.affectedRows!==1)throw new Error('User allocation failed');
      const found=await this.execute<Array<{CODIGO:number}>>(session.instance,'SELECT CODIGO FROM operadores WHERE LOGIN=? LIMIT 2',[values['LOGIN']]);
      if(!Array.isArray(found)||found.length!==1)throw new Error('Created user unavailable');
      const row=await this.row(session.instance,schema,found[0]!.CODIGO);if(!row)throw new Error('Created user unavailable');
      return this.response(session.instance,row,schema);
    },true);
  }
  async patch(session:unknown,rawId:unknown,input:unknown){
    admin(session);const userId=id(rawId);if(userId<=0)return invalid('O usuário padrão do sistema não pode ser alterado.');
    const body=object(input,['changes','version']);if(typeof body['version']!=='string'||!/^[a-f0-9]{64}$/.test(body['version']))return invalid('Recarregue o cadastro antes de salvar.');
    return this.safe(async()=>{
      const schema=await this.metadata(session.instance),changes=object(body['changes'],schema.fields.map(field=>field.name));
      if(!Object.keys(changes).length)return invalid('Informe os campos que deseja alterar.');
      const before=await this.row(session.instance,schema,userId);if(!before)throw new CatalogError(404,'CRM_USER_NOT_FOUND','Usuário não encontrado.');
      if(this.version(session.instance,before)!==body['version'])throw new CatalogError(409,'CRM_USER_CHANGED','O cadastro foi alterado. Recarregue para continuar.');
      const values:Row={};for(const [key,value] of Object.entries(changes))values[key]=this.value(schema.fields.find(field=>field.name===key)!,value);
      const fields=schema.fields,cas=fields.map(field=>field.type==='number'?`${quote(field.name)} <=> ?`:`${binary(field.type==='date'?`CAST(${quote(field.name)} AS CHAR)`:quote(field.name))} <=> ${binary('?')}`).join(' AND ');
      const result=await this.execute<{affectedRows:number}>(session.instance,`UPDATE operadores SET ${Object.keys(values).map(key=>quote(key)+'=?').join(',')} WHERE CODIGO=? AND ${cas}`,[...Object.values(values),userId,...fields.map(field=>before[field.name])]);
      const after=await this.row(session.instance,schema,userId);if(!after)throw new CatalogError(404,'CRM_USER_NOT_FOUND','Usuário não encontrado.');
      const noop=Object.entries(values).every(([key,value])=>before[key]===value);
      if(result?.affectedRows!==1&&!(result?.affectedRows===0&&noop&&this.version(session.instance,after)===body['version']))throw new CatalogError(409,'CRM_USER_CHANGED','O cadastro foi alterado. Recarregue para continuar.');
      return this.response(session.instance,after,schema);
    },true);
  }
}
export default new UserRegistrationService();
