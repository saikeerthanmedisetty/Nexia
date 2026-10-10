'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AgentTask {
  id: string;
  agentName: string;
  status: 'pending' | 'running' | 'done' | 'error';
  startTime: Date;
  endTime?: Date;
  result?: string;
}

export interface AgentActivityProps {
  tasks: AgentTask[];
}

export function AgentActivity({ tasks }: AgentActivityProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!tasks || tasks.length === 0) return null;

  const allDone = tasks.every(t => t.status === 'done' || t.status === 'error');
  const runningTasks = tasks.filter(t => t.status === 'running').length;

  const getStatusIcon = (status: AgentTask['status']) => {
    switch (status) {
      case 'pending': return <Clock size={16} className="text-zinc-400" />;
      case 'running': return <Loader2 size={16} className="text-blue-500 animate-spin" />;
      case 'done': return <CheckCircle2 size={16} className="text-green-500" />;
      case 'error': return <XCircle size={16} className="text-red-500" />;
    }
  };

  const calculateElapsed = (task: AgentTask) => {
    const end = task.endTime || new Date();
    const ms = end.getTime() - task.startTime.getTime();
    return (ms / 1000).toFixed(1) + 's';
  };

  return (
    <div className="w-full max-w-4xl mx-auto mb-4 border rounded-xl overflow-hidden bg-card/50 backdrop-blur-sm shadow-sm">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center space-x-2">
          <img
            src="/brand/nexia-mark-dark.png"
            alt="Nexia"
            className="w-4 h-4 object-contain select-none"
          />
          <span className="text-sm font-medium">
            {allDone 
              ? 'Tasks completed' 
              : `Processing (${runningTasks} active step${runningTasks !== 1 ? 's' : ''})`}
          </span>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t"
          >
            <div className="p-4 space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(task.status)}
                    <span className="font-medium text-foreground/80">{task.agentName}</span>
                  </div>
                  <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full",
                      task.status === 'running' && "bg-blue-500/10 text-blue-500 font-medium",
                      task.status === 'done' && "text-green-600",
                      task.status === 'error' && "text-red-600",
                    )}>
                      {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                    </span>
                    <span className="w-12 text-right tabular-nums">{calculateElapsed(task)}</span>
                  </div>
                </div>
              ))}
              
              {allDone && (
                <div className="pt-2 mt-2 border-t flex justify-end">
                  <span className="text-xs text-muted-foreground">
                    Summary: {tasks.filter(t => t.status === 'done').length} successful, {tasks.filter(t => t.status === 'error').length} failed
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
