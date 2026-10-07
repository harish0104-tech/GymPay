import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const whatsappDeliveryEnabled = Deno.env.get('ENABLE_WHATSAPP_DELIVERY') === 'true';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface WhatsAppConfig {
  access_token: string;
  phone_number_id: string;
  api_version: string;
}

function todayInKolkata(): string {
  const now = new Date();
  const kolkataStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [month, day, year] = kolkataStr.split('/');
  return `${year}-${month}-${day}`;
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    // already has country code
  } else if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
}

interface SendWhatsAppResult {
  success: boolean;
  error?: string;
}

async function sendWhatsAppMessage(config: WhatsAppConfig, toPhone: string, message: string): Promise<SendWhatsAppResult> {
  const url = `https://graph.facebook.com/${config.api_version}/${config.phone_number_id}/messages`;
  const to = normalizePhone(toPhone);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: {
          preview_url: false,
          body: message,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, error: `WhatsApp API error (${response.status}): ${errorBody}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error sending WhatsApp" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const requestBody = await req.json().catch(() => ({})) as { gym_id?: string };
    const requestedGymId = requestBody.gym_id?.trim() || null;

    // Manual runs are always scoped to a gym owned by the authenticated user.
    // Scheduled cron runs omit gym_id and continue processing every gym.
    if (requestedGymId) {
      const bearerToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      if (!bearerToken) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: { user }, error: userError } = await supabase.auth.getUser(bearerToken);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: ownedGym } = await supabase.from('gyms').select('id')
        .eq('id', requestedGymId).eq('owner_user_id', user.id).maybeSingle();
      if (!ownedGym) {
        return new Response(JSON.stringify({ error: 'You do not have access to this gym account' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const today = todayInKolkata();

    // Get all active memberships
    let membershipsQuery = supabase
      .from('memberships')
      .select('*, member:members(*), plan:plans(*), gym:gyms(*)')
      .in('status', ['active', 'expiring_soon', 'expired']);
    if (requestedGymId) membershipsQuery = membershipsQuery.eq('gym_id', requestedGymId);
    const { data: memberships, error: mbrError } = await membershipsQuery;

    if (mbrError) throw mbrError;

    let gymsQuery = supabase.from('gyms').select('id');
    if (requestedGymId) gymsQuery = gymsQuery.eq('id', requestedGymId);
    const { data: gyms, error: gymsError } = await gymsQuery;
    if (gymsError) throw gymsError;

    // Get notification settings per gym
    let notificationSettingsQuery = supabase
      .from('notification_settings')
      .select('*');
    if (requestedGymId) notificationSettingsQuery = notificationSettingsQuery.eq('gym_id', requestedGymId);
    const { data: notifSettings } = await notificationSettingsQuery;

    const notifMap = new Map<string, any>();
    (notifSettings ?? []).forEach((ns: any) => notifMap.set(ns.gym_id, ns));

    // Get WhatsApp API config per gym
    let whatsappConfigsQuery = supabase
      .from('whatsapp_config')
      .select('*');
    if (requestedGymId) whatsappConfigsQuery = whatsappConfigsQuery.eq('gym_id', requestedGymId);
    const { data: whatsappConfigs } = await whatsappConfigsQuery;

    const whatsappMap = new Map<string, WhatsAppConfig>();
    (whatsappConfigs ?? []).forEach((wc: any) => whatsappMap.set(wc.gym_id, {
      access_token: wc.access_token,
      phone_number_id: wc.phone_number_id,
      api_version: wc.api_version || 'v21.0',
    }));

    let createdCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let whatsappSentCount = 0;
    let whatsappFailedCount = 0;
    const dueGymIds = new Set<string>();

    for (const mbr of memberships ?? []) {
      if (!mbr.member?.is_active) continue;

      const ns = notifMap.get(mbr.gym_id);
      const expiryDayEnabled = ns ? ns.expiry_day_enabled : true;
      const whatsappEnabled = whatsappDeliveryEnabled && (ns ? ns.whatsapp_enabled : false);
      const ownerWhatsappNumber = ns?.owner_whatsapp_number || mbr.gym?.owner_whatsapp_number;
      const waConfig = whatsappMap.get(mbr.gym_id);

      if (mbr.expiry_date === today) dueGymIds.add(mbr.gym_id);

      // --- On expiry date reminder ---
      if (expiryDayEnabled && mbr.expiry_date === today) {
        const reminderMessage = `${mbr.member.name}'s ${mbr.plan.name} membership expires today. ₹${mbr.plan.price} renewal payment is due.`;

        const { data: existing } = await supabase
          .from('reminders')
          .select('id, status')
          .eq('membership_id', mbr.id)
          .eq('reminder_type', 'on_expiry_date')
          .eq('scheduled_date', today)
          .maybeSingle();

        if (existing) {
          // If previously failed due to missing config, retry now
          if (existing.status === 'failed' && whatsappEnabled && ownerWhatsappNumber && waConfig) {
            const result = await sendWhatsAppMessage(waConfig, ownerWhatsappNumber, reminderMessage);
            if (result.success) {
              await supabase.from('reminders').update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                failure_reason: null,
              }).eq('id', existing.id);
              whatsappSentCount++;
            } else {
              await supabase.from('reminders').update({
                status: 'failed',
                failure_reason: result.error,
              }).eq('id', existing.id);
              whatsappFailedCount++;
            }
          }
          skippedCount++;
        } else {
          let channel = 'in_app';
          let status = 'sent';
          let sentAt = new Date().toISOString();

          if (whatsappEnabled && ownerWhatsappNumber) {
            channel = 'whatsapp';
            status = 'pending';
            sentAt = new Date().toISOString();
          }

          const { error } = await supabase.from('reminders').insert({
            gym_id: mbr.gym_id,
            member_id: mbr.member_id,
            membership_id: mbr.id,
            reminder_type: 'on_expiry_date',
            scheduled_date: today,
            channel: channel as any,
            status: status as any,
            message: reminderMessage,
            sent_at: sentAt,
            failure_reason: null,
          });

          if (error) {
            if (error.code === '23505') { skippedCount++; } else { failedCount++; }
          } else {
            createdCount++;
          }
        }
      }

      // Update membership status based on expiry
      let newStatus = mbr.status;
      if (mbr.expiry_date < today) {
        newStatus = 'expired';
      } else if (mbr.expiry_date === today) {
        newStatus = 'expiring_soon';
      } else {
        newStatus = 'active';
      }

      if (newStatus !== mbr.status) {
        await supabase.from('memberships').update({ status: newStatus }).eq('id', mbr.id);
      }
    }

    // Every gym receives one daily status message. When nobody is due, persist an
    // owner-facing in-app message and ask the push dispatcher to deliver it once.
    const allClearGymIds = (gyms ?? []).map(gym => gym.id).filter(gymId => !dueGymIds.has(gymId));
    if (allClearGymIds.length > 0) {
      const rows = allClearGymIds.map(gymId => ({
        gym_id: gymId,
        notification_date: today,
        notification_type: 'no_clients_due',
        title: 'No clients due today',
        message: 'There are no clients with a membership plan due today.',
        updated_at: new Date().toISOString(),
      }));
      const { error: allClearError } = await supabase.from('owner_daily_notifications').upsert(rows, {
        onConflict: 'gym_id,notification_date,notification_type',
        ignoreDuplicates: true,
      });
      if (allClearError) throw allClearError;
    }

    // --- Process all pending AND failed WhatsApp reminders: send via WhatsApp API ---
    let actionableRemindersQuery = supabase
      .from('reminders')
      .select('*, gym:gyms(*)')
      .in('status', ['pending', 'failed'])
      .eq('channel', 'whatsapp');
    if (requestedGymId) actionableRemindersQuery = actionableRemindersQuery.eq('gym_id', requestedGymId);
    const { data: actionableReminders } = await actionableRemindersQuery;

    for (const reminder of actionableReminders ?? []) {
      const gymNs = notifMap.get(reminder.gym_id);
      const recipientNumber = gymNs?.owner_whatsapp_number || reminder.gym?.owner_whatsapp_number;
      const waConfig = whatsappMap.get(reminder.gym_id);

      if (!gymNs?.whatsapp_enabled || !recipientNumber) {
        await supabase.from('reminders').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          failure_reason: 'WhatsApp not enabled — in-app only',
        }).eq('id', reminder.id);
        continue;
      }

      if (!waConfig) {
        await supabase.from('reminders').update({
          status: 'failed',
          failure_reason: 'WhatsApp API not configured. Go to Settings to add your WhatsApp Business API credentials.',
        }).eq('id', reminder.id);
        whatsappFailedCount++;
        continue;
      }

      // Actually send the WhatsApp message
      const result = await sendWhatsAppMessage(waConfig, recipientNumber, reminder.message || '');

      if (result.success) {
        await supabase.from('reminders').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          failure_reason: null,
        }).eq('id', reminder.id);
        whatsappSentCount++;
      } else {
        await supabase.from('reminders').update({
          status: 'failed',
          failure_reason: result.error || 'Unknown WhatsApp error',
        }).eq('id', reminder.id);
        whatsappFailedCount++;
      }
    }

    // Dispatch the same reminder records to the additive in-app, browser push,
    // and email layer. WhatsApp remains available separately behind its flag.
    let notificationDispatch = null;
    try {
      const dispatchResponse = await fetch(`${supabaseUrl}/functions/v1/dispatch-notifications`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(requestedGymId ? { gym_id: requestedGymId } : {}),
          reminder_type: 'on_expiry_date',
          all_clear_gym_ids: allClearGymIds,
        }),
      });
      notificationDispatch = await dispatchResponse.json();
    } catch (dispatchError) {
      notificationDispatch = { success: false, error: dispatchError instanceof Error ? dispatchError.message : String(dispatchError) };
    }

    // Manual delivery and automatic 09:00 delivery share the same daily intent.
    // Once a manual run has dispatched successfully, cancel only this gym's
    // matching pending queue rows so the owner does not receive duplicates.
    if (requestedGymId && notificationDispatch?.success) {
      const dueMembershipIds = (memberships ?? [])
        .filter(membership => membership.expiry_date === today && membership.member?.is_active)
        .map(membership => membership.id);

      if (dueMembershipIds.length > 0) {
        await supabase.from('scheduled_notifications').update({
          status: 'cancelled',
          processing_started_at: null,
          error_message: 'Delivered by manual Send Now action',
          updated_at: new Date().toISOString(),
        })
          .eq('gym_id', requestedGymId)
          .eq('notification_type', 'on_expiry_date')
          .in('membership_id', dueMembershipIds)
          .in('status', ['pending', 'failed']);
      } else {
        await supabase.from('scheduled_notifications').update({
          status: 'cancelled',
          processing_started_at: null,
          error_message: 'Delivered by manual Send Now action',
          updated_at: new Date().toISOString(),
        })
          .eq('gym_id', requestedGymId)
          .eq('idempotency_key', `${requestedGymId}:all-clear:${today}`)
          .in('status', ['pending', 'failed']);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        gym_id: requestedGymId,
        created: createdCount,
        skipped: skippedCount,
        failed: failedCount,
        whatsapp_sent: whatsappSentCount,
        whatsapp_failed: whatsappFailedCount,
        whatsapp_configured: whatsappMap.size > 0,
        all_clear: allClearGymIds.length,
        notification_dispatch: notificationDispatch,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null
        ? JSON.stringify(err)
        : String(err);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
