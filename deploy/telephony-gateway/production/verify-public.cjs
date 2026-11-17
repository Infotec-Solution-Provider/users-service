'use strict';
// Real TLS and gateway authorization, without REGISTER/INVITE, SIP passwords or calls.
const fs=require('node:fs'),assert=require('node:assert/strict'),https=require('node:https'),crypto=require('node:crypto'),os=require('node:os'),{createRequire}=require('node:module');
const LIVE='/home/inpulse/htdocs/inpulse.infotecrs.inf.br/users-service',ROOT='/home/inpulse/odim-telephony-gateway-20261117',app=createRequire(LIVE+'/dist/main.js');
assert.equal(process.platform,'linux');assert.equal(process.getuid(),1003);assert.equal(os.hostname().split('.')[0],'srv733293');
const gateway=app('./services/telephony-gateway'),helper=app('./operator-features/rollout'),environment=gateway.readGatewayEnvironment();assert(environment);
const base={instance:'odim',userId:534,sipUser:'2710',host:'131.161.3.106',port:5060};
function handshake(token,origin='https://inpulse.infotecrs.inf.br'){
 return new Promise((resolve,reject)=>{const req=https.request({hostname:'lux.infotecrs.inf.br',port:443,path:'/telephony-gw'+(token?'?token='+token:''),method:'GET',rejectUnauthorized:true,timeout:12000,headers:{Upgrade:'websocket',Connection:'Upgrade',Origin:origin,'Sec-WebSocket-Version':'13','Sec-WebSocket-Key':crypto.randomBytes(16).toString('base64'),'Sec-WebSocket-Protocol':'sip'}},response=>{response.resume();resolve(response.statusCode);});req.on('upgrade',(response,socket)=>{socket.destroy();resolve(response.statusCode);});req.on('timeout',()=>req.destroy(Error('WSS_TIMEOUT')));req.on('error',()=>reject(Error('WSS_CONNECTION_FAILED')));req.end();});
}
(async()=>{
 const expected={missingToken:403,foreignOrigin:403,invalidSignature:403,otherOperator:403,authorizedOperator:101};
 const observed={missingToken:await handshake(null),foreignOrigin:await handshake(gateway.issueGatewayToken(environment,base),'https://foreign.example.test'),invalidSignature:await handshake('invalid.signature.'+'x'.repeat(30)),otherOperator:await handshake(gateway.issueGatewayToken(environment,{...base,userId:535})),authorizedOperator:await handshake(gateway.issueGatewayToken(environment,base))};assert.deepEqual(observed,expected,'PUBLIC_WSS_CONTRACT');
 const principals=[];for(const userId of[1,6,32,534,535]){const value=helper.operatorFeatures({instance:'odim',userId});assert(value.features.whatsapp===true&&value.features.telephony===(userId===534));principals.push({operatorId:userId,telephony:value.features.telephony,whatsapp:value.features.whatsapp});}
 const result={passed:true,atUtc:new Date().toISOString(),websocketUrl:environment.websocketUrl,expected,observed,principals,tls:'normal verification; no insecure fallback',sipRegistrations:0,callsPlaced:0,mediaTested:false,secretsPrinted:false};fs.writeFileSync(ROOT+'/public-verification.json',JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));
})().catch(error=>{console.error(JSON.stringify({ok:false,code:/^[A-Z_]+$/.test(String(error.message))?error.message:error.code||error.name}));process.exitCode=1;});
