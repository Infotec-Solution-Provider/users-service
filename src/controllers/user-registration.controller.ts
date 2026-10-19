import { Router, type Request, type Response, type NextFunction } from 'express';
import isAuthenticated from '../middlewares/is-authenticated.middleware';
import { CatalogError } from '../services/crm-catalogs/contract';
import registration, { UserRegistrationService } from '../services/user-registration.service';
import authService from '../services/auth.service';
import { crmTenantAuthentication } from '../middlewares/crm-tenant-scope.middleware';
export function createUserRegistrationRouter(service:UserRegistrationService=registration,authenticator=isAuthenticated,revoke=authService.revokeUserSessions.bind(authService)){
  const router=Router();
  const authenticate=crmTenantAuthentication(authenticator);
  router.use('/crm/user-registration',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});
  router.get('/crm/user-registration/schema',authenticate,async(req,res)=>res.json({data:await service.schema(req.session)}));
  router.get('/crm/user-registration/:id',authenticate,async(req,res)=>res.json({data:await service.detail(req.session,req.params['id'])}));
  router.post('/crm/user-registration',authenticate,async(req,res)=>res.status(201).json({data:await service.create(req.session,req.body)}));
  router.patch('/crm/user-registration/:id',authenticate,async(req,res)=>{
    const data=await service.patch(req.session,req.params['id'],req.body);
    if(['SENHA','NIVEL','ATIVO'].some(key=>Object.hasOwn(req.body.changes,key)))try{await revoke(req.session.instance,Number(req.params['id']))}catch{throw new CatalogError(503,'CRM_USER_WRITE_UNKNOWN','Cadastro salvo; não foi possível confirmar a atualização das sessões. Recarregue antes de continuar.','UNKNOWN')}
    res.json({data});
  });
  router.use((error:unknown,_req:Request,res:Response,next:NextFunction)=>{if(!(error instanceof CatalogError))return next(error);return res.status(error.status).json({code:error.code,message:error.message,...(error.outcome?{outcome:error.outcome}:{})})});
  return router;
}
export default createUserRegistrationRouter();
