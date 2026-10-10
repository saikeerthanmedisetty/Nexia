import { NextResponse } from 'next/server';

// In-memory store for pending email approvals across sessions
let pendingApprovals: Array<{
  id: string;
  threadId: string;
  subject: string;
  recipient: string;
  drafted_response: string;
  action_items?: string[];
  resumeUrl: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'discarded';
}> = [];

/**
 * POST /api/email/approval
 * Called by n8n HTTP Request node ("Notify Approval Gateway")
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { threadId, subject, recipient, drafted_response, action_items, resumeUrl } = body;

    const approvalItem = {
      id: `approval_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      threadId: threadId || 'unknown_thread',
      subject: subject || 'No Subject',
      recipient: recipient || 'Unknown Recipient',
      drafted_response: typeof drafted_response === 'string' ? drafted_response : JSON.stringify(drafted_response),
      action_items: Array.isArray(action_items) ? action_items : [],
      resumeUrl: resumeUrl || '',
      timestamp: new Date().toISOString(),
      status: 'pending' as const,
    };

    // Keep the most recent 20 approvals in memory
    pendingApprovals = [approvalItem, ...pendingApprovals.slice(0, 19)];

    console.log('📬 [Email Agent HITL] New approval request received from n8n:', {
      threadId: approvalItem.threadId,
      recipient: approvalItem.recipient,
      subject: approvalItem.subject,
      resumeUrl: approvalItem.resumeUrl,
    });

    return NextResponse.json({
      success: true,
      message: 'Approval queued in Nexia',
      approval: approvalItem,
    });
  } catch (error: any) {
    console.error('Error in /api/email/approval POST:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/email/approval
 * Polled by the UI to fetch active pending approvals
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    approvals: pendingApprovals.filter(a => a.status === 'pending'),
    all: pendingApprovals,
  });
}
