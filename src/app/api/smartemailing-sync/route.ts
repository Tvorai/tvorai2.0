import { NextRequest, NextResponse } from "next/server"; 
 
export async function POST(req: NextRequest) { 
  try { 
    const body = await req.json(); 
    const { email, name = "", surname = "" } = body; 
 
    if (!email) { 
      return NextResponse.json({ error: "Missing email" }, { status: 400 }); 
    } 
 
    const username = process.env.SMARTEMAILING_USERNAME!; 
    const apiKey = process.env.SMARTEMAILING_API_KEY!; 
    const listId = process.env.SMARTEMAILING_LIST_ID!; 
 
    const auth = Buffer.from(`${username}:${apiKey}`).toString("base64"); 
 
    const response = await fetch("https://app.smartemailing.cz/api/v3/contacts", { 
      method: "POST", 
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Basic ${auth}`, 
      }, 
      body: JSON.stringify({ 
        emailaddress: email, 
        name, 
        surname, 
        contactlists: [ 
          { 
            id: Number(listId), 
            status: "confirmed", 
          }, 
        ], 
      }), 
    }); 
 
    const data = await response.json().catch(() => null); 
 
    if (!response.ok) { 
      return NextResponse.json( 
        { error: "SmartEmailing error", detail: data }, 
        { status: 500 } 
      ); 
    } 
 
    return NextResponse.json({ ok: true, smartemailing: data }); 
  } catch (error) { 
    return NextResponse.json( 
      { error: "Internal error" }, 
      { status: 500 } 
    ); 
  } 
} 
