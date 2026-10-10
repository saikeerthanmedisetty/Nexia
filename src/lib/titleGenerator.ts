/**
 * Intelligent Semantic Chat Title Generator
 * Converts user prompts into clean, professional 2-4 word executive topic titles
 * (e.g. "How many total views and subscribers do I have right now?" -> "YouTube Channel Analytics")
 */

export function generateSmartTitle(prompt: string): string {
  if (!prompt || !prompt.trim()) return 'Executive Session';

  // 1. Clean raw text: remove leading/trailing quotes, markdown, and extra whitespace
  let clean = prompt
    .replace(/^["'`\s]+|["'`\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = clean.toLowerCase();

  // 2. YouTube & Video Intelligence
  if (/\b(?:youtube|subscribers?|viewcount|views?|channel|video|videos|thumbnail)\b/i.test(lower)) {
    if (/\b(?:stats?|metrics?|analytics?|views?|subscribers?|sub count|telemetry)\b/i.test(lower)) {
      return 'YouTube Channel Analytics';
    }
    if (/\b(?:upload|publish|stage|post)\b/i.test(lower)) {
      return 'Publish YouTube Video';
    }
    if (/\b(?:sum|summarize|transcript|breakdown)\b/i.test(lower)) {
      return 'Video Intelligence Summary';
    }
    if (/\b(?:search|find)\b/i.test(lower)) {
      return 'YouTube Video Search';
    }
    return 'YouTube Channel Analytics';
  }

  // 3. Expenses & Financial Ledger
  if (/\b(?:spent|rupees?|rs|inr|expense|expenses|ledger|cost|paid|spend|spending|bill|receipt|swiggy|zomato|petrol|fuel)\b/i.test(lower)) {
    if (/\b(?:breakdown|total|burn rate|statement|how much)\b/i.test(lower)) {
      return 'Financial Statement & Burn Rate';
    }
    if (/\b(?:swiggy|zomato|dinner|lunch|food|restaurant|dining|snack|coffee|cafe)\b/i.test(lower)) {
      return 'Food & Dining Expense';
    }
    if (/\b(?:petrol|fuel|diesel|gas)\b/i.test(lower)) {
      return 'Fuel & Transit Expense';
    }
    if (/\b(?:monitor|tech|laptop|office|hardware|equipment)\b/i.test(lower)) {
      return 'Office Equipment Expense';
    }
    if (/\b(?:spotify|subscription|netflix|prime)\b/i.test(lower)) {
      return 'Subscription Expense';
    }
    const amountMatch = clean.match(/(?:₹|rs\.?|rupees?)\s*(\d+[\d,]*)|(\d+[\d,]*)\s*(?:₹|rs\.?|rupees?)/i);
    const amountStr = amountMatch ? ` (₹${amountMatch[1] || amountMatch[2]})` : '';
    return `Expense Ledger Entry${amountStr}`;
  }

  // 4. Uber Mobility & Rides (Note: use \bauto\b to avoid matching "autonomous")
  if (/\b(?:uber|ride|cab|taxi|driver)\b/i.test(lower) || /\bauto\b/i.test(lower)) {
    if (/\b(?:airport|kempegowda|blr)\b/i.test(lower)) {
      return 'Uber to Bangalore Airport';
    }
    const destMatch = clean.match(/(?:to|towards)\s+([A-Za-z0-9\s]{3,20}?)(?:\s+(?:right now|asap|today|at|for)|$)/i);
    if (destMatch && destMatch[1]) {
      const destName = destMatch[1].trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return `Uber to ${destName}`;
    }
    if (/\b(?:fare|fares|cost|tariff|estimate|price)\b/i.test(lower)) {
      return 'Uber Fare Estimate';
    }
    return 'Uber Mobility Dispatch';
  }

  // 5. Google Calendar & Schedule
  if (/\b(?:calendar|schedule|meeting|agenda|commitments?)\b/i.test(lower) || /\bplate\b/i.test(lower)) {
    if (/\b(?:tomorrow|solapur|train)\b/i.test(lower)) {
      return 'Tomorrow Travel & Schedule';
    }
    if (/\b(?:today|plate|agenda|day)\b/i.test(lower)) {
      return 'Daily Schedule & Agenda';
    }
    if (/\b(?:weekend|friday|saturday|sunday)\b/i.test(lower)) {
      return 'Weekend Schedule Review';
    }
    if (/\b(?:sync|team|call|review|catch-up)\b/i.test(lower)) {
      const match = clean.match(/(?:schedule|book|set up)\s+(?:a\s+)?([A-Za-z0-9\s]{3,24}?)(?:\s+(?:at|on|for|tomorrow|today)|$)/i);
      if (match && match[1]) {
        const titleWords = match[1].trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return `${titleWords} Meeting`;
      }
      return 'Meeting Schedule';
    }
    return 'Executive Schedule';
  }

  // 6. Gmail & Executive Communications
  if (/\b(?:email|emails|mail|gmail|inbox)\b/i.test(lower)) {
    if (/\b(?:unread|check|recent|priority)\b/i.test(lower)) {
      return 'Unread Inbox Digest';
    }
    if (/\b(?:send|dispatch|outbound)\b/i.test(lower)) {
      return 'Outbound Email Dispatch';
    }
    if (/\b(?:draft|reply|respond)\b/i.test(lower)) {
      return 'Draft Email Response';
    }
    return 'Executive Email Communications';
  }

  // 7. Chief of Staff Briefings & Priorities
  if (/\b(?:briefing|rundown|dossier|morning)\b/i.test(lower)) {
    return 'Executive Daily Briefing';
  }
  if (/\b(?:priorit(?:y|ies)|urgent|focus)\b/i.test(lower)) {
    return 'Priority & Focus Review';
  }

  // 8. Research & Intelligence
  if (/\b(?:research|market|dominating|competitors?|industry|benchmarks?|trends?)\b/i.test(lower)) {
    if (/\b(?:dominating|market|agent)\b/i.test(lower)) {
      return 'AI Market Intelligence';
    }
    return 'Strategic Research Dossier';
  }

  // 9. Short phrases or queries (e.g. "what is this", "hello", "who are you")
  const words = clean.split(' ');
  if (words.length <= 4) {
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Take up to 4 words without exceeding 28 characters
  let candidate = '';
  for (const word of words) {
    if ((candidate + ' ' + word).trim().length > 28) break;
    candidate = (candidate + ' ' + word).trim();
  }

  candidate = candidate.replace(/\b(?:and|or|the|a|an|in|on|at|to|for|with|of|is|my|your|by)\b$/gi, '').trim();

  return candidate ? candidate.charAt(0).toUpperCase() + candidate.slice(1) : 'Executive Session';
}

/**
 * Checks if an existing session title looks raw, chopped, or has stray quotes
 */
export function isMalformedTitle(title?: string): boolean {
  if (!title) return true;
  const t = title.trim();
  if (t === 'New Conversation' || t === 'New Chat' || t === 'Executive Session') return true;
  if (t.startsWith('"') || t.startsWith("'") || t.endsWith('"') || t.endsWith("'")) return true;
  if (t.endsWith('...') && (t.length <= 35 || /\b(?:tod|execut|views a|spent 350 rupee)\b/i.test(t))) return true;
  return false;
}
