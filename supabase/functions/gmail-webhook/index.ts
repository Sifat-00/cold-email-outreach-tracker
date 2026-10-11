const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PubSubMessage {
  message?: {
    data?: string;
    attributes?: Record<string, string>;
    messageId?: string;
  };
  subscription?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: PubSubMessage = await req.json();

    const message = body.message;
    if (!message || !message.data) {
      return new Response(JSON.stringify({ error: "No message data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gmail push notifications contain a base64-encoded JSON payload with
    // emailAddress and historyId
    let emailAddress: string | null = null;
    let historyId: string | null = null;

    try {
      const decoded = atob(message.data);
      const gmailData = JSON.parse(decoded);
      emailAddress = gmailData.emailAddress || null;
      historyId = String(gmailData.historyId || "");
    } catch {
      // If decoding fails, still accept the notification
      historyId = message.data;
    }

    // Store the notification in Supabase so the Python backend can pick it up
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/gmail_push_notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        history_id: historyId,
        email_address: emailAddress,
        received_at: new Date().toISOString(),
        processed: false,
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      return new Response(JSON.stringify({ error: "Failed to store notification", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, historyId, emailAddress }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
