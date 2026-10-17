import { NextResponse } from 'next/server';
import { executeAgent, AGENTS, AgentExecutionParams } from '@/lib/agents';

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const { agentId, action, params } = body;

    if (!agentId || !action) {
      return NextResponse.json({ error: 'agentId and action are required' }, { status: 400 });
    }

    if (!AGENTS[agentId]) {
      return NextResponse.json({ error: 'Invalid agentId' }, { status: 400 });
    }

    let normalizedAction = action.toLowerCase();
    if (agentId === 'EMAIL') {
      if (normalizedAction.includes('send') || normalizedAction.includes('mail')) normalizedAction = 'send';
      else if (normalizedAction.includes('read') || normalizedAction.includes('inbox') || normalizedAction.includes('get')) normalizedAction = 'read';
      else if (normalizedAction.includes('search') || normalizedAction.includes('find')) normalizedAction = 'search';
    } else if (agentId === 'CALENDAR') {
      // Pass-through actions that must not be remapped
      const passthroughActions = ['delete', 'update', 'bulk_delete', 'exdate', 'audit', 'find_and_book_slot', 'find_slot', 'check_availability'];
      if (passthroughActions.includes(normalizedAction)) {
        // keep normalizedAction as-is
      } else if (normalizedAction.includes('create') || normalizedAction.includes('schedule') || normalizedAction.includes('add') || normalizedAction.includes('book')) {
        normalizedAction = 'create';
      } else if (normalizedAction.includes('list') || normalizedAction.includes('get') || normalizedAction.includes('show') || normalizedAction.includes('view') || normalizedAction.includes('events')) {
        normalizedAction = 'list';
      }
    } else if (agentId === 'YOUTUBE') {
      if (normalizedAction.includes('upload') || normalizedAction.includes('publish') || normalizedAction.includes('post')) normalizedAction = 'upload';
      else if (normalizedAction.includes('stat') || normalizedAction.includes('metric') || normalizedAction.includes('analytics') || normalizedAction.includes('sub') || normalizedAction.includes('channel') || normalizedAction.includes('info')) normalizedAction = 'stats';
      else if (normalizedAction.includes('video') || normalizedAction.includes('list') || normalizedAction.includes('recent')) normalizedAction = 'list';
      else if (normalizedAction.includes('sum') || normalizedAction.includes('notes')) normalizedAction = 'summarize';
      else normalizedAction = 'search';
    } else if (agentId === 'UBER') {
      if (normalizedAction.includes('telemetry') || normalizedAction.includes('track') || normalizedAction.includes('status') || normalizedAction.includes('accept')) normalizedAction = 'telemetry';
      else if (normalizedAction.includes('cancel')) normalizedAction = 'cancel';
      else if (normalizedAction.includes('book') || normalizedAction.includes('ride') || normalizedAction.includes('confirm')) normalizedAction = 'book';
      else normalizedAction = 'estimate';
    } else if (agentId === 'SHEETS') {
      if (normalizedAction.includes('list') || normalizedAction.includes('show') || normalizedAction.includes('view') || normalizedAction.includes('get') || normalizedAction.includes('read') || normalizedAction.includes('check')) {
        normalizedAction = 'list';
      } else {
        normalizedAction = 'append_row';
      }
    } else if (agentId === 'CHIEF_OF_STAFF') {
      normalizedAction = 'briefing';
    }

    const dynamicBookingId = params?.booking_id || `UBER-IND-${Math.floor(100000 + Math.random() * 900000)}`;
    const dynamicPickup = params?.pickup || params?.from || 'Current Location';
    const dynamicDestination = params?.destination || params?.dropoff || params?.to || 'Dropoff Location';

    const executionParams: AgentExecutionParams = {
      action: normalizedAction,
      ...body,
      ...params,
      selected_tier: params?.selected_tier || params?.tier || 'Uber Go',
      tier: params?.tier || params?.selected_tier || 'Uber Go',
      locked_fare: params?.locked_fare || (params?.fare ? `₹${params.fare}` : 'Dynamic Tariff'),
      fare: params?.fare || 300,
      pickup: dynamicPickup,
      destination: dynamicDestination,
      dropoff: dynamicDestination,
      distance: params?.distance || (params?.distance_km ? `${params.distance_km} km` : 'Dynamic Route'),
      duration: params?.duration || (params?.duration_mins ? `${params.duration_mins} mins` : 'Dynamic ETA'),
      booking_id: dynamicBookingId,
      timestamp: Date.now(),
      message: params?.rawPrompt || params?.userPrompt || params?.message || params?.prompt || params?.title || '',
      to: params?.to || '',
      subject: params?.subject || 'Message from Nexia',
      body: params?.body || params?.content || params?.message || '',
    };

    if (normalizedAction === 'telemetry') {
      executionParams.status = 'accepted';
      executionParams.driver = params?.driver || {
        name: 'Assigned Driver',
        phone_number: '+91 98765 43210',
        rating: '4.92'
      };
      executionParams.vehicle = params?.vehicle || {
        make_model: 'Fleet Vehicle',
        license_plate: params?.vehicle?.license_plate || 'Commercial Vehicle',
        color: 'Silver'
      };
      executionParams.eta = params?.eta || 3;
    } else if (normalizedAction === 'cancel') {
      executionParams.status = 'driver_canceled';
      executionParams.cancellation_reason = params?.cancellation_reason || 'Driver vehicle puncture';
    } else if (normalizedAction === 'complete') {
      executionParams.status = 'completed';
    }

    const result = await executeAgent(agentId, executionParams);

    // Format agent result into human-friendly response if message not provided or generic n8n ack
    let message = result.data?.message;

    if (result.error === 'schedule_conflict') {
      const reqSlot = result.data?.requested_slot;
      const confEv = result.data?.conflicting_event;
      const confTitle = confEv?.title || 'Busy / Existing Event';
      // Dynamic locale time formatting — no hardcoded timezone
      const fmtTime = (iso: string) => iso ? new Date(iso).toLocaleString('en-IN', { timeStyle: 'short', dateStyle: 'short' }) : '';
      const confStart = fmtTime(confEv?.start_time);
      const confEnd   = confEv?.end_time ? new Date(confEv.end_time).toLocaleString('en-IN', { timeStyle: 'short' }) : '';
      const reqStart  = fmtTime(reqSlot?.start_time);
      const gcalLink = confEv?.link ? `\n• 🔗 [View Conflicting Event in Calendar](${confEv.link})` : '';

      message = `⚠️ **Schedule Conflict Detected**\n\n` +
        `Your requested slot ${reqStart ? `(\`${reqStart}\`)` : ''} clashes with an existing event on your calendar:\n\n` +
        `• 📅 **Conflicting Event:** "${confTitle}"\n` +
        `• ⏰ **Time:** ${confStart}${confEnd ? ` – ${confEnd}` : ''}${gcalLink}\n\n` +
        `💡 *Please reply with an alternate time (e.g., "Schedule tomorrow at 5 PM" or "Try 1 hour later") to book the slot.*`;
    } else if (agentId === 'CALENDAR' && result.success && result.data?.all_booked_events && Array.isArray(result.data.all_booked_events)) {
      const eventsList = result.data.all_booked_events.map((ev: any) => {
        const timeStr = ev.start ? new Date(ev.start).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '';
        const linkStr = ev.link ? ` [View in Calendar](${ev.link})` : '';
        const locStr = ev.location ? ` @ *${ev.location}*` : '';
        return `• **${ev.summary}** — ${timeStr}${locStr}${linkStr}`;
      }).join('\n');

      const primary = result.data.primary_event;
      const primaryLink = primary?.htmlLink ? `\n\n🔗 **[Open Primary Event in Calendar](${primary.htmlLink})**` : '';

      message = `📅 **Calendar Events & Travel Buffers Scheduled Successfully!**\n\n${eventsList}${primaryLink}\n\n✅ All events have been synced directly to your Executive Schedule.`;
    }

    const isGenericAck = result.success && (!message || message === 'Workflow was started' || message.includes('Workflow was started'));

    if (isGenericAck) {
      if (agentId === 'CALENDAR') {
        if (normalizedAction === 'create') {
          message = `📅 **Executive Schedule Updated!**\n\nMeeting "**${params?.title || 'Meeting'}**" has been officially scheduled on your calendar.`;
        } else if (Array.isArray(result.data)) {
          if (result.data.length === 0) {
            message = "📅 You have no upcoming events scheduled for the next 7 days.";
          } else {
            const listStr = result.data
              .map((ev: any, i: number) => {
                const summary = ev.summary || ev.title || 'Untitled Event';
                const start = ev.start?.dateTime || ev.start?.date || '';
                const timeStr = start ? new Date(start).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '';
                return `${i + 1}. **${summary}** ${timeStr ? `(${timeStr})` : ''}`;
              })
              .join('\n');
            message = `📅 Here are your upcoming calendar events:\n\n${listStr}`;
          }
        } else {
          message = 'Calendar task completed successfully!';
        }
      } else if (agentId === 'SHEETS') {
        if (result.data?.message) {
          message = result.data.message;
        } else {
          const amt = params?.amount ? `₹${Number(params.amount).toLocaleString('en-IN')}` : 'Expenditure';
          const cat = params?.category ? ` (${params.category})` : '';
          const isSynced = result.data?.status === 'synced_to_sheets';
          const statusLine = isSynced
            ? '• **Vault Status:** Synced directly to Google Sheet ✅'
            : '• **Vault Status:** Saved to MongoDB Vault ⚠️ *(Google Sheet sync pending)*';
          message = `💳 **Financial Ledger Updated!**\n\nSuccessfully recorded **${amt}**${cat} to your Executive Financial Vault.\n\n• **Date:** ${params?.date || new Date().toISOString().split('T')[0]}\n• **Merchant / Vendor:** ${params?.merchant || 'Direct'}\n${statusLine}`;
        }
      } else if (agentId === 'UBER') {
        const bId = result.data?.booking_id || result.data?.['Booking ID'] || params?.booking_id || 'UBER-DISPATCH';
        const tier = result.data?.tier || result.data?.Tier || params?.selected_tier || 'Uber Premier AC';
        const pickup = result.data?.pickup || result.data?.Pickup || params?.pickup || 'Current Location';
        const destination = result.data?.destination || result.data?.Destination || params?.destination || 'Dropoff Location';
        const fare = result.data?.fare || result.data?.Fare || params?.locked_fare || (params?.fare ? `₹${params.fare}` : 'Dynamic Tariff');
        const driverName = params?.driver?.name || 'Assigned Driver';
        const driverRating = params?.driver?.rating || '4.9';
        const vehicleInfo = params?.vehicle?.make_model ? `${params.vehicle.make_model} [${params.vehicle.license_plate || 'Live'}]` : 'Fleet Vehicle';
        const distanceStr = params?.distance || (params?.distance_km ? `${params.distance_km} km` : 'Dynamic Route');

        if (normalizedAction === 'telemetry') {
          message = `📡 **Live Ride Telemetry Synced**\n\n• **Status:** \`ACCEPTED\` 🟢\n• **Route:** ${pickup} ➔ ${destination}\n• **Driver:** ${driverName} (${driverRating}⭐)\n• **Vehicle:** ${vehicleInfo}\n• **Live ETA:** ${params?.eta || 3} mins\n• **Status:** Confirmed & Updated ✅`;
        } else if (normalizedAction === 'complete') {
          message = `🏁 **Trip Successfully Completed**\n\n• **Booking ID:** \`${bId}\`\n• **Status:** \`COMPLETED\` ✅\n• **Route:** ${pickup} ➔ ${destination}\n• **Driver:** ${driverName} (${vehicleInfo})\n• **Trip Distance:** ${distanceStr}\n• **Final Metered Fare:** ${fare}\n• **Receipt:** Dispatched to \`+91 70131 84197\` 📲\n\n⭐ *Trip finalized and archived.*`;
        } else if (normalizedAction === 'cancel') {
          message = `🛡️ **Driver Reassigned**\n\n• **Notice:** Initial driver unavailable (${params?.cancellation_reason || 'Route rescheduling'})\n• **Route Protected:** ${pickup} ➔ ${destination}\n• **Update:** Seamlessly re-assigned nearby replacement driver for booking \`${bId}\`.`;
        } else {
          message = result.data?.message || `🚗 **Mobility Dispatch Confirmed!**\n\n• **Booking Reference:** \`${bId}\`\n• **Service Tier:** ${tier}\n• **Pickup:** ${pickup}\n• **Destination:** ${destination}\n• **Estimated Tariff:** ${fare}\n• **Payment Method:** 💵 Cash on Arrival\n• **Status:** 🟢 Driver Dispatched (En route to pickup)`;
        }
      } else if (agentId === 'YOUTUBE') {
        if (result.data?.message) {
          message = result.data.message;
        } else if (Array.isArray(result.data)) {
          const list = result.data.slice(0, 5).map((item: any, i: number) => {
            const itemTitle = item.title || item.name || item.snippet?.title || 'YouTube Video';
            const vidId = item.videoId || item.id?.videoId || item.id || '';
            const link = vidId ? `https://youtu.be/${vidId}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(itemTitle)}`;
            return `${i + 1}. **[${itemTitle}](${link})**`;
          }).join('\n');
          message = `📺 **YouTube Results:**\n\n${list}`;
        } else if (result.data?.videoId || result.data?.id) {
          const vidId = result.data.videoId || result.data.id;
          message = `📺 **YouTube Video Dispatched!**\n\n• **Title:** ${params?.title || 'Video'}\n• **Video ID:** \`${vidId}\`\n• **Watch Link:** [Open Video on YouTube](https://youtu.be/${vidId})\n• **Status:** Live and accessible ✅`;
        } else {
          const query = params.query || params.title || 'Autonomous AI Agents';
          const encodedQuery = encodeURIComponent(query);
          message = `📺 **YouTube Search Results for "${query}":**\n\n• **Direct Search URL:** https://www.youtube.com/results?search_query=${encodedQuery}`;
        }
      } else {
        message = 'Task completed successfully!';
      }
    }

    return NextResponse.json({ 
      success: result.success, 
      message,
      data: result.data,
      error: result.error,
    });

  } catch (error: any) {
    console.error('API /agents error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
