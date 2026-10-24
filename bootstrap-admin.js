const {body,database,json,requireSameOrigin,user}=require('./_lib');

module.exports=async function(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Use POST to verify your administrator account.'});
  try{
    requireSameOrigin(req);
    const identity=await user(req);
    if(!identity.email||!identity.email_verified)return json(res,403,{error:'Verify your email address before opening the dashboard.'});
    const confirmation=await body(req);
    if(confirmation.action!=='claim')return json(res,400,{error:'Submit the administrator claim confirmation.'});
    if(identity.admin!==true)await require('firebase-admin').auth().setCustomUserClaims(identity.uid,{admin:true});
    await database().ref(`admins/${identity.uid}`).set({email:identity.email.toLowerCase(),createdAt:new Date().toISOString()});
    return json(res,200,{admin:true});
  }catch(error){
    return json(res,400,{error:error.message||'Could not confirm administrator access.'});
  }
};
