const {cfg,database,json}=require('./_lib');
// Open /api/status to see which settings the deployed site can read (no secrets shown).
module.exports=async function(req,res){
  let firebase='ok',owner='unknown',admins='unknown';
  try{await database().ref('products').limitToFirst(1).get()}catch(error){firebase=`error: ${error.message}`}
  try{owner=(await database().ref('meta/owner/uid').get()).exists()?'set':'missing';admins=(await database().ref('meta/admins').limitToFirst(1).get()).exists()?'listed':'none'}catch(error){owner=`error: ${error.message}`}
  return json(res,200,{
    version:'2026-10-24-config-in-repo',
    firebaseAdmin:firebase,
    firebaseMode:cfg('FIREBASE_DATABASE_SECRET')?'database secret or service account':'service account',
    owner,
    admins,
    paystackSecret:cfg('PAYSTACK_SECRET_KEY')?'set':'missing (add to config.js)',
    cloudinary:cfg('CLOUDINARY_API_KEY')&&cfg('CLOUDINARY_API_SECRET')?'set':'missing (add to config.js)',
    adminEmails:cfg('ADMIN_EMAILS')?'listed':'first account becomes owner',
    receiptEmail:cfg('RESEND_API_KEY')&&cfg('RESEND_FROM')?'set':'off'
  });
};
