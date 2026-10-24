const {body,database,json,requireSameOrigin,user}=require('./_lib');

module.exports=async function(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Use POST to verify your administrator account.'});
  try{
    requireSameOrigin(req);
    const identity=await user(req);
    if(!identity.email)return json(res,403,{error:'This account has no email address.'});
    const confirmation=await body(req);
    if(confirmation.action!=='claim')return json(res,400,{error:'Submit the administrator claim confirmation.'});
    const email=identity.email.toLowerCase();
    const allowlist=String(process.env.ADMIN_EMAILS||'').split(',').map(item=>item.trim().toLowerCase()).filter(Boolean);
    let allowed=identity.admin===true||allowlist.includes(email);
    if(!allowed){
      // First account ever created on the dashboard becomes the owner.
      const existing=await database().ref('admins').limitToFirst(1).get();
      allowed=!existing.exists();
    }
    if(!allowed)return json(res,403,{error:'This is a shopper account, not a store administrator. Ask the store owner to add your email to ADMIN_EMAILS.'});
    if(identity.admin!==true)await require('firebase-admin').auth().setCustomUserClaims(identity.uid,{admin:true});
    await database().ref(`admins/${identity.uid}`).set({email,createdAt:new Date().toISOString()});
    return json(res,200,{admin:true});
  }catch(error){
    return json(res,400,{error:error.message||'Could not confirm administrator access.'});
  }
};
