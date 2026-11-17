'use strict';
// Provision new integration keys without reading existing secrets or printing key material.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),os=require('node:os');
const root='/home/inpulse/odim-telephony-gateway-20261117',directory=path.join(root,'private');
assert.equal(process.platform,'linux');assert.equal(process.getuid(),1003);assert.equal(os.hostname().split('.')[0],'srv733293');
fs.mkdirSync(directory,{mode:0o700});assert(!fs.lstatSync(directory).isSymbolicLink());
const shared={version:1,websocketUrl:'wss://lux.infotecrs.inf.br/telephony-gw',apiKey:crypto.randomBytes(32).toString('hex'),allowedNetworks:['131.161.3.106/32'],principals:[{instance:'odim',userId:534}]};
const full={...shared,tokenSecret:crypto.randomBytes(32).toString('hex'),tokenTtlSeconds:900};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const[name,value]of[['gateway.json',full],['gateway-proxy.json',shared]])fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const report={atUtc:new Date().toISOString(),gatewayConfigSha256:sha(path.join(directory,'gateway.json')),gatewayProxySha256:sha(path.join(directory,'gateway-proxy.json')),allowedOperatorId:534,instance:'odim',pbx:'131.161.3.106:5060',websocketUrl:shared.websocketUrl,secretsPrinted:false,signingKeyStaysOnHostinger:true};
fs.writeFileSync(path.join(root,'private-config-metadata.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));
