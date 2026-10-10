import { NextResponse } from 'next/server';
import {
  getAllTasks,
  recordTask,
  updateTaskStatus,
  getPendingApprovals,
  AgentTaskRecord,
  TaskStatus,
} from '@/lib/tasks';
import { executeAgent } from '@/lib/agents';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || undefined) as TaskStatus | undefined;
    const agentId = (searchParams.get('agentId') || undefined) as any;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;

    const allTasks = await getAllTasks({ limit: 100 });
    const filteredTasks = await getAllTasks({ status, agentId, limit });
    const pendingApprovals = await getPendingApprovals();

    const metrics = {
      total: allTasks.length,
      completed: allTasks.filter((t) => t.status === 'completed').length,
      running: allTasks.filter((t) => t.status === 'running').length,
      waitingApproval: pendingApprovals.length,
      failed: allTasks.filter((t) => t.status === 'failed').length,
    };

    return NextResponse.json(
      {
        success: true,
        tasks: filteredTasks,
        pendingApprovals,
        metrics,
      },
      {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, taskId, agentId, title, details, params } = body;

    // Handle Human-in-the-Loop decision on an existing task (Approve / Reject)
    if (action === 'approve' && taskId) {
      const all = await getAllTasks();
      const target = all.find((t) => t.id === taskId);

      if (!target) {
        return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
      }

      // Execute downstream agent action if necessary
      let execResult: any = { success: true, message: 'Approved and executed by user' };
      try {
        if (target.agentId && target.action) {
          const res = await executeAgent(target.agentId, {
            action: target.action,
            ...(target.params || {}),
          });
          execResult = res;
        }
      } catch (execErr: any) {
        console.warn('[Tasks API] Downstream execute notice:', execErr?.message);
      }

      const updated = await updateTaskStatus(taskId, 'completed', execResult);
      return NextResponse.json({ success: true, task: updated, result: execResult });
    }

    if (action === 'reject' && taskId) {
      const updated = await updateTaskStatus(taskId, 'failed', { rejectedByUser: true });
      return NextResponse.json({ success: true, task: updated });
    }

    // Otherwise, create a new task
    const newTask = await recordTask({
      agentId: agentId || 'CHIEF_OF_STAFF',
      action: action || 'execute',
      title: title || 'Assigned Agent Task',
      status: (body.status as TaskStatus) || 'pending',
      details: details || 'Task logged from Nexia Orchestrator.',
      params: params || {},
      durationMs: body.durationMs || 0,
    });

    return NextResponse.json({ success: true, task: newTask }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { taskId, status, result } = body;

    if (!taskId || !status) {
      return NextResponse.json({ success: false, error: 'taskId and status are required' }, { status: 400 });
    }

    const updated = await updateTaskStatus(taskId, status, result);
    return NextResponse.json({ success: true, task: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
