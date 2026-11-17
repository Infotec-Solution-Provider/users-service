'use strict';
// Fixed application-owned Odim singleton setting; no arbitrary SQL or SIP registration.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),os=require('node:os'),crypto=require('node:crypto');
const ROOT='/home/inpulse/odim-telephony-gateway-20261117',LIVE='/home/inpulse/htdocs/inpulse.infotecrs.inf.br/users-service';
const desired={enabled:true,mode:'gateway',websocketUrl:'',domain:'',pbxAddress:'131.161.3.106:5060',iceServers:[]};
const empty={enabled:false,mode:'direct',websocketUrl:'',domain:'',pbxAddress:'',iceServers:[]};
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function save(file,value){const tmp=file+'.tmp';assert(!fs.existsSync(tmp));fs.writeFileSync(tmp,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});fs.renameSync(tmp,file);}
async function configure(action,settings,options={}){
 const root=options.root||ROOT,receipt=root+'/odim-settings-receipt.json',plan=root+'/odim-settings-plan.json';
 const current=await settings.get('odim');
 if(action==='plan'){assert(!fs.existsSync(plan)&&!fs.existsSync(receipt),'CONFIGURATION_ALREADY_PLANNED');assert.deepEqual(current,empty,'EXISTING_CONFIGURATION_REQUIRES_REVIEW');save(plan,{atUtc:new Date().toISOString(),instance:'odim',actor:'system-deployment',previous:current,desiredSha256:digest(desired)});return{planned:true,instance:'odim',pbx:desired.pbxAddress,operatorId:534};}
 const prepared=JSON.parse(fs.readFileSync(plan));assert.equal(prepared.desiredSha256,digest(desired));
 if(action==='apply'){
  assert(!fs.existsSync(receipt),'CONFIGURATION_ALREADY_STARTED');assert.deepEqual(current,prepared.previous,'CONFIGURATION_CHANGED');const state={atUtc:new Date().toISOString(),phase:'applying',instance:'odim',actor:'system-deployment',previous:current,desiredSha256:digest(desired)};save(receipt,state);
  try{await settings.save('odim',0,desired);}catch(error){const observed=await settings.get('odim').catch(()=>null);if(observed&&digest(observed)===digest(desired)){state.acknowledgementLost=true;}else{state.phase='needs-review';save(receipt,state);throw error;}}
  const after=await settings.get('odim');assert.deepEqual(after,desired,'CONFIGURATION_READBACK_FAILED');state.phase='configured';state.completedAtUtc=new Date().toISOString();save(receipt,state);return{configured:true,instance:'odim',operatorId:534,pbx:desired.pbxAddress,mode:'gateway',sipRegistrations:0,callsPlaced:0};
 }
 const state=JSON.parse(fs.readFileSync(receipt));assert.equal(state.phase,'configured');assert.deepEqual(current,desired,'OWNED_CONFIGURATION_REQUIRED');
 if(action==='rollback'){await settings.save('odim',0,state.previous);assert.deepEqual(await settings.get('odim'),state.previous);state.phase='rolled-back';save(receipt,state);return{rolledBack:true};}
 assert.equal(action,'verify');return{verified:true,instance:'odim',operatorId:534,pbx:desired.pbxAddress,mode:'gateway',sipRegistrations:0,callsPlaced:0};
}
module.exports={configure,desired,empty};
if(require.main===module){(async()=>{assert.equal(process.platform,'linux');assert.equal(process.getuid(),1003);assert.equal(os.hostname().split('.')[0],'srv733293');assert.equal(path.resolve(process.cwd()),LIVE);assert(['plan','apply','verify','rollback'].includes(process.argv[2]));const {createRequire}=require('node:module'),app=createRequire(LIVE+'/dist/main.js');app('dotenv/config');const settings=app('./services/webrtc-settings.service').default;const gateway=app('./services/telephony-gateway'),environment=gateway.readGatewayEnvironment();assert(environment&&gateway.isGatewayPrincipalAllowed(environment,{instance:'odim',userId:534})&&!gateway.isGatewayPrincipalAllowed(environment,{instance:'odim',userId:535}),'PRIVATE_GATEWAY_SCOPE');console.log(JSON.stringify(await configure(process.argv[2],settings)));})().catch(error=>{console.error(JSON.stringify({ok:false,code:/^[A-Z_]+$/.test(String(error.message))?error.message:error.code||error.name}));process.exitCode=1;});}
