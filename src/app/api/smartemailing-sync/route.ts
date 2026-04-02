 import { NextRequest, NextResponse } from "next/server"; 
 
 export async function POST(req: NextRequest) { 
   try { 
     const body = await req.json(); 
 
     return NextResponse.json({ 
       ok: true, 
       received: body, 
       envCheck: { 
         hasUsername: !!process.env.SMARTEMAILING_USERNAME, 
         hasApiKey: !!process.env.SMARTEMAILING_API_KEY, 
         hasListId: !!process.env.SMARTEMAILING_LIST_ID, 
       }, 
     }); 
   } catch (error) { 
     return NextResponse.json( 
       { ok: false, error: "Invalid request body" }, 
       { status: 400 } 
     ); 
   } 
 } 
 
