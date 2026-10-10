"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Sidebar, ChatSession, defaultStarterSessions } from "@/components/layout/Sidebar";
import { ChatWindow, Message } from "@/components/chat/ChatWindow";
import { ChatInput, ChatImagePayload } from "@/components/chat/ChatInput";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PendingAction } from "@/components/chat/HITLCard";
import { TraceStep } from "@/lib/gemini";
import { AgentTask } from "@/components/chat/AgentActivity";
import { ProfileModal } from "@/components/auth/ProfileModal";
import { useAuth } from "@/contexts/AuthContext";
import { formatUserName } from "@/lib/utils";
import { toast } from "sonner";
import { generateSmartTitle, isMalformedTitle } from "@/lib/titleGenerator";
import { ShareModal } from "@/components/chat/ShareModal";
import { Globe } from "lucide-react";

function ChatPageContent() {
  const searchParams = useSearchParams();
  const { user, handleLogout } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [sharedChatNotice, setSharedChatNotice] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Stop generation midway handler
  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    toast.info("Generation stopped.");
  }, []);

  const [youtubeChannel, setYoutubeChannel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("omni_user_yt_channel") || "@SaikeerthanMedisetty";
    }
    return "@SaikeerthanMedisetty";
  });

  // ─── Hydrate Persistent Sessions from localStorage ──────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem("nexia_chat_sessions_v2");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hydrated = parsed.map((sess: any) => {
            const rawMessages = sess.messages || [];
            let cleanTitle = sess.title || '';
            
            // If the title is malformed (starts with quotes, cut off with ..., etc.), upgrade it intelligently using the first user prompt
            if (isMalformedTitle(cleanTitle)) {
              const firstUserMsg = rawMessages.find((m: any) => m.role === 'user')?.content;
              if (firstUserMsg) {
                cleanTitle = generateSmartTitle(firstUserMsg);
              }
            }
            cleanTitle = cleanTitle.replace(/\b(?:agent|agents|assistant|assistants|ai|workflow|workflows)\b/gi, '').replace(/\s+/g, ' ').trim();
            cleanTitle = cleanTitle.replace(/^["'`\s]+|["'`\s]+$/g, '').trim();

            return {
              ...sess,
              title: cleanTitle || 'Executive Session',
              messages: rawMessages.map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp),
              })),
            };
          });
          setSessions(hydrated);
          try {
            localStorage.setItem("nexia_chat_sessions_v2", JSON.stringify(hydrated));
          } catch {}
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to parse past chat sessions:", e);
    }
    setSessions([]);
  }, []);

  // ─── Sync Current Conversation to Active Session ──────────
  const syncSessionMessages = useCallback((newMessages: Message[]) => {
    if (newMessages.length === 0) return;

    setSessions((prev) => {
      let targetId = activeSessionId;
      let targetList = [...prev];

      if (!targetId) {
        const firstUserMsg = newMessages.find(m => m.role === 'user')?.content || 'New Conversation';
        const smartTitle = generateSmartTitle(firstUserMsg);
        
        const lower = firstUserMsg.toLowerCase();
        let iconType: ChatSession['iconType'] = 'chat';
        if (lower.includes('uber') || lower.includes('ride') || lower.includes('auto') || lower.includes('cab')) iconType = 'uber';
        else if (lower.includes('calendar') || lower.includes('meeting') || lower.includes('schedule') || lower.includes('sync')) iconType = 'calendar';
        else if (lower.includes('email') || lower.includes('mail') || lower.includes('gmail')) iconType = 'email';
        else if (lower.includes('receipt') || lower.includes('expense') || lower.includes('sheet') || lower.includes('bill')) iconType = 'receipt';
        else if (lower.includes('youtube') || lower.includes('video') || lower.includes('thumbnail')) iconType = 'video';

        const newSession: ChatSession = {
          id: 'sess_' + Date.now(),
          title: smartTitle,
          updatedAt: Date.now(),
          iconType,
          messages: newMessages,
        };
        targetId = newSession.id;
        setActiveSessionId(targetId);
        targetList = [newSession, ...targetList];
      } else {
        targetList = targetList.map((s) => {
          if (s.id === targetId) {
            let updatedTitle = s.title;
            if (isMalformedTitle(updatedTitle)) {
              const firstUserMsg = newMessages.find(m => m.role === 'user')?.content;
              if (firstUserMsg) {
                updatedTitle = generateSmartTitle(firstUserMsg);
              }
            }
            return {
              ...s,
              title: updatedTitle,
              updatedAt: Date.now(),
              messages: newMessages,
            };
          }
          return s;
        });
      }

      try {
        localStorage.setItem("nexia_chat_sessions_v2", JSON.stringify(targetList));
      } catch (e) {}

      return targetList;
    });
  }, [activeSessionId]);

  useEffect(() => {
    if (messages.length > 0) {
      syncSessionMessages(messages);
    }
  }, [messages, syncSessionMessages]);

  const handleUpdateChannel = useCallback((newChannel: string) => {
    setYoutubeChannel(newChannel);
    if (typeof window !== "undefined") {
      localStorage.setItem("omni_user_yt_channel", newChannel);
    }
  }, []);

  const handleUpdateParams = useCallback((newParams: Record<string, any>) => {
    setPendingAction((prev) => prev ? {
      ...prev,
      params: { ...prev.params, ...newParams },
    } : null);
    if (newParams.channel) {
      handleUpdateChannel(newParams.channel);
    }
  }, [handleUpdateChannel]);

  // Generate a unique ID for messages
  const generateId = () => Math.random().toString(36).substring(2, 15);

  const consumedParamsRef = useRef<Set<string>>(new Set());

  // ─── Reset / New Chat ──────────────────────────────────
  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    setAgentTasks([]);
    setTraceSteps([]);
    setPendingAction(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    toast.info("Started a new chat session.");
  }, []);

  // ─── Select Past Activity / Session ─────
  const handleSelectSession = useCallback((session: ChatSession) => {
    setActiveSessionId(session.id);
    setMessages(session.messages || []);
    setPendingAction(null);
    setAgentTasks([]);
    setTraceSteps([]);
    setIsLoading(false);
  }, []);

  // Listen for navigation query params (?new=true, ?session=<id>, or ?share=<id>)
  useEffect(() => {
    if (!searchParams) return;
    const isNew = searchParams.get('new') === 'true';
    const shareId = searchParams.get('share');
    const sessionId = searchParams.get('session');

    if (isNew && !consumedParamsRef.current.has('new')) {
      consumedParamsRef.current.add('new');
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
      handleNewChat();
      return;
    }

    if (shareId && !consumedParamsRef.current.has(`share_${shareId}`)) {
      consumedParamsRef.current.add(`share_${shareId}`);
      (async () => {
        try {
          const res = await fetch(`/api/chat/share?id=${shareId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.conversation) {
              const loadedMsgs = (data.conversation.messages || []).map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp),
              }));
              setMessages(loadedMsgs);
              setSharedChatNotice(`Shared Conversation: "${data.conversation.title}"`);
              toast.success("Loaded shared conversation", {
                description: data.conversation.title,
              });
            }
          }
        } catch (err) {
          console.warn("Notice loading shared conversation:", err);
        }
      })();
      return;
    }

    if (sessionId && !consumedParamsRef.current.has(`session_${sessionId}`) && sessions.length > 0) {
      const found = sessions.find((s) => s.id === sessionId);
      if (found) {
        consumedParamsRef.current.add(`session_${sessionId}`);
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname);
        }
        handleSelectSession(found);
      }
    }
  }, [searchParams, sessions.length, handleNewChat, handleSelectSession]);

  // ─── Share Active Conversation ──────────────────────────
  const handleShareChat = useCallback(async () => {
    if (messages.length === 0) {
      toast.error("No messages in this chat to share yet.");
      return;
    }

    setIsSharing(true);
    try {
      const activeSession = sessions.find(s => s.id === activeSessionId);
      const title = activeSession?.title || messages.find(m => m.role === 'user')?.content.slice(0, 45) || 'Executive Conversation';

      const res = await fetch('/api/chat/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          title,
          messages: messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.shareId) {
          const fullUrl = `${window.location.origin}/chat?share=${data.shareId}`;
          setShareUrl(fullUrl);
          setIsShareModalOpen(true);
          try {
            await navigator.clipboard.writeText(fullUrl);
            toast.success("Public link copied to your clipboard", {
              description: "Anyone with this link can see this conversation",
              duration: 4500,
            });
          } catch {}
          return;
        }
      }
      throw new Error("Failed to create share link");
    } catch {
      toast.error("Failed to share conversation. Please try again.");
    } finally {
      setIsSharing(false);
    }
  }, [messages, sessions, activeSessionId]);

  // ─── Delete Past Activity / Session ─────
  const handleDeleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== sessionId);
      try {
        localStorage.setItem("nexia_chat_sessions_v2", JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
      setPendingAction(null);
      setAgentTasks([]);
      setTraceSteps([]);
    }
    toast.success("Conversation deleted.");
  }, [activeSessionId]);

  // ─── Rename Past Activity / Session ─────
  const handleRenameSession = useCallback((sessionId: string, newTitle: string) => {
    setSessions((prev) => {
      const updated = prev.map((s) => s.id === sessionId ? { ...s, title: newTitle } : s);
      try {
        localStorage.setItem("nexia_chat_sessions_v2", JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    toast.success("Conversation renamed.");
  }, []);

  // ─── Pin / Unpin Session ─────
  const handlePinSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      let isPinnedNow = false;
      const updated = prev.map((s) => {
        if (s.id === sessionId) {
          isPinnedNow = !s.isPinned;
          return { ...s, isPinned: isPinnedNow };
        }
        return s;
      });
      try {
        localStorage.setItem("nexia_chat_sessions_v2", JSON.stringify(updated));
      } catch (e) {}
      if (isPinnedNow) {
        toast.success("Conversation pinned to top.");
      } else {
        toast.success("Conversation unpinned.");
      }
      return updated;
    });
  }, []);

  // ─── Archive / Unarchive Session ─────
  const handleArchiveSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      let isArchivedNow = false;
      const updated = prev.map((s) => {
        if (s.id === sessionId) {
          isArchivedNow = !s.isArchived;
          return { ...s, isArchived: isArchivedNow };
        }
        return s;
      });
      try {
        localStorage.setItem("nexia_chat_sessions_v2", JSON.stringify(updated));
      } catch (e) {}
      if (isArchivedNow) {
        toast.success("Conversation moved to Archived Chats.");
      } else {
        toast.success("Conversation restored to Recent Activity.");
      }
      return updated;
    });
  }, []);

  // ─── Clear All Chat History (from ProfileModal) ─────
  const handleClearAllHistory = useCallback(() => {
    try {
      localStorage.removeItem("nexia_chat_sessions_v2");
    } catch (e) {}
    setSessions([]);
    setActiveSessionId(null);
    setMessages([]);
    setPendingAction(null);
    setAgentTasks([]);
    setTraceSteps([]);
    toast.success("All chat history cleared.");
  }, []);

  // ─── Execute an agent action via n8n ───────────────────
  const executeAgentTask = useCallback(async (
    agentId: string, 
    action: string, 
    params: Record<string, any>,
    currentTraceSteps?: TraceStep[]
  ) => {
    const task: AgentTask = {
      id: generateId(),
      agentName: agentId,
      status: "running",
      startTime: new Date(),
    };
    setAgentTasks((prev) => [...prev, task]);

    // Update trace step for agent execution to 'running'
    if (currentTraceSteps) {
      setTraceSteps(prev => 
        prev.map(s => s.agent === agentId ? { ...s, status: 'running' } : s)
      );
    }

    try {
      if (agentId === 'CHIEF_OF_STAFF' && params.dossier) {
        return;
      }

      if (params.alreadyDispatched) {
        const messageText = `🎬 Video metadata and 16:9 custom thumbnail published to YouTube successfully!`;
        setAgentTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: "done",
                  endTime: new Date(),
                  result: messageText,
                }
              : t
          )
        );
        setTraceSteps(prev => 
          prev.map(s => s.agent === agentId ? { ...s, status: 'done', durationMs: 380 } : s)
        );
        const resultMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: messageText,
          timestamp: new Date(),
          agentName: agentId,
        };
        setMessages((prev) => [...prev, resultMessage]);
        return;
      }

      const agentResponse = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          action,
          params,
        }),
      });

      const agentResult = await agentResponse.json();
      const isSuccess = Boolean(
        agentResult.success || 
        agentResult.data?.success || 
        (agentResponse.ok && !agentResult.error)
      );
      const messageText = 
        agentResult.message || 
        agentResult.data?.message || 
        (isSuccess ? "Task executed successfully!" : (agentResult.error || "Task execution failed"));

      // Update task status
      setAgentTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: isSuccess ? "done" : "error",
                endTime: new Date(),
                result: messageText,
              }
            : t
        )
      );

      // Update trace step to 'done'
      setTraceSteps(prev => 
        prev.map(s => s.agent === agentId ? { ...s, status: isSuccess ? 'done' : 'error', durationMs: 380 } : s)
      );

      // Add result message
      const resultMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: messageText,
        timestamp: new Date(),
        agentName: agentId,
      };
      setMessages((prev) => [...prev, resultMessage]);

    } catch {
      setAgentTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: "error",
                endTime: new Date(),
                result: "Agent execution failed",
              }
            : t
        )
      );

      setTraceSteps(prev => 
        prev.map(s => s.agent === agentId ? { ...s, status: 'error', detail: 'Automated action notice' } : s)
      );

      const errorMessage: Message = {
        id: generateId(),
        role: "assistant",
        content:
          "I was unable to complete that action right now. Please try again in a moment.",
        timestamp: new Date(),
        agentName: "Nexia",
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  }, []);

  // ─── Handle sending a message or image ─────────────────
  const handleSendMessage = useCallback(async (content: string, image?: ChatImagePayload) => {
    const trimmed = content.trim();
    const isRetryPrompt = /^(retry|continue|try\s+again|resume|run\s+again|try\s+now|redo|please\s+retry|please\s+continue)$/i.test(trimmed);
    let retryTargetPrompt: string | undefined;

    if (isRetryPrompt) {
      const prevSubstantive = messages
        .slice()
        .reverse()
        .find(m => m.role === 'user' && !/^(retry|continue|try\s+again|resume|run\s+again|try\s+now|redo|please\s+retry|please\s+continue)$/i.test(m.content.trim()));
      
      if (prevSubstantive) {
        retryTargetPrompt = prevSubstantive.content;
        toast.info(`Retrying: "${retryTargetPrompt.slice(0, 36)}${retryTargetPrompt.length > 36 ? '...' : ''}"`);
      }
    }

    // 1. Add user message to the chat
    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: content || (image?.isVideo ? `Attached Video (${image.fileName || 'video.mp4'}) for review` : image ? "Attached document for analysis" : ""),
      timestamp: new Date(),
      imageUrl: image?.isVideo ? undefined : image?.previewUrl,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // If the message is a new prompt (not a confirmation/rejection), immediately clear stale pendingAction from UI
      const isConfirmationOrUpdate = /^(yes|confirm|approve|proceed|go ahead|cancel|no|stop|reject|update|change)\b/i.test(content.trim());
      const activePendingAction = isConfirmationOrUpdate ? pendingAction : null;
      if (!isConfirmationOrUpdate) {
        setPendingAction(null);
        setMessages((prev) => prev.map((m) => {
          if (m.stagedAction && m.actionStatus === 'pending') {
            return { ...m, actionStatus: 'cancelled' };
          }
          return m;
        }));
      }

      // Build cross-session memory from other historical conversations
      const otherSessions = sessions
        .filter((s) => s.id !== activeSessionId && s.messages && s.messages.length > 0)
        .slice(0, 8);

      const crossSessionMemory = otherSessions.length > 0
        ? otherSessions.map((s) => {
            const userPrompts = s.messages
              .filter((m) => m.role === 'user')
              .map((m) => m.content.slice(0, 100))
              .join(' | ');
            const lastAssistantMsg = s.messages
              .filter((m) => m.role === 'assistant')
              .slice(-1)[0]?.content.slice(0, 140) || '';
            return `• Past Chat "${s.title}": [User: ${userPrompts}] -> [Resolution: ${lastAssistantMsg}]`;
          }).join('\n')
        : undefined;

      // 2. Call the coordinator API with full history, cross-session memory, and pending action state
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          retryTargetPrompt,
          crossSessionMemory,
          image: image ? { 
            data: image.data, 
            mimeType: image.mimeType, 
            isVideo: image.isVideo, 
            name: image.fileName,
            thumbnailData: image.thumbnailData,
          } : undefined,
          pendingAction: activePendingAction ? {
            id: activePendingAction.id,
            agent: activePendingAction.agent,
            action: activePendingAction.action,
            params: activePendingAction.params,
            confirmationDetails: activePendingAction.confirmationDetails,
          } : null,
          userProfile: {
            name: formatUserName(user?.displayName, user?.email),
            email: user?.email || '',
            youtubeChannel,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      // Set Real-Time Observability Trace
      if (data.traceSteps && data.traceSteps.length > 0) {
        setTraceSteps(data.traceSteps);
      }

      // 3. Process AI Decision
      if (data.type === "action_confirm") {
        const finalParams = { ...(pendingAction?.params || {}), ...(data.params || {}) };
        setPendingAction(null);
        setMessages((prev) => prev.map((m) => {
          if (m.stagedAction && m.actionStatus === 'pending') {
            return { ...m, actionStatus: 'confirmed' };
          }
          return m;
        }));
        const confirmMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: data.explanation || `Confirmed! Processing your request...`,
          timestamp: new Date(),
          agentName: "Nexia",
        };
        setMessages((prev) => [...prev, confirmMsg]);
        await executeAgentTask(data.agent, data.action, finalParams, data.traceSteps);
      } else if (data.type === "action_update") {
        const updatedParams = { ...(pendingAction?.params || {}), ...(data.params || {}) };
        if (updatedParams.channel) {
          handleUpdateChannel(updatedParams.channel);
        }
        if (data.agent === 'CALENDAR' || (data.params && ('hasConflict' in data.params || 'startTime' in data.params))) {
          updatedParams.hasConflict = Boolean(data.params?.hasConflict);
          updatedParams.conflict = Boolean(data.params?.conflict);
          updatedParams.isConflict = Boolean(data.params?.isConflict);
          updatedParams.conflictingEvent = data.params?.conflictingEvent;
          updatedParams.conflictReason = data.params?.conflictReason;
          updatedParams.overlapMinutes = data.params?.overlapMinutes || 0;
          updatedParams.conflicts = data.params?.conflicts || [];
        }
        setPendingAction((prev) => prev ? {
          ...prev,
          params: updatedParams,
          confirmationDetails: data.confirmationDetails || prev.confirmationDetails,
        } : {
          id: generateId(),
          agent: data.agent,
          action: data.action,
          params: updatedParams,
          confirmationDetails: data.confirmationDetails,
        });
        const updateMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: data.explanation || `Updated task parameters.`,
          timestamp: new Date(),
          agentName: "Nexia",
        };
        setMessages((prev) => [...prev, updateMsg]);
      } else if (data.type === "action_cancel") {
        setPendingAction(null);
        setMessages((prev) => prev.map((m) => {
          if (m.stagedAction && m.actionStatus === 'pending') {
            return { ...m, actionStatus: 'cancelled' };
          }
          return m;
        }));
        const cancelMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: data.explanation || `🛡️ Action cancelled safely. No changes made.`,
          timestamp: new Date(),
          agentName: "Nexia",
        };
        setMessages((prev) => [...prev, cancelMsg]);
      } else if (data.type === "action_stage" || data.type === "agent_task") {
        // If it's CHIEF_OF_STAFF, the briefing/dossier was already fetched and synthesized by the orchestrator!
        if (data.agent === 'CHIEF_OF_STAFF') {
          const cosAction: PendingAction | null = data.params?.dossier ? {
            id: generateId(),
            agent: 'CHIEF_OF_STAFF',
            action: data.action || 'briefing',
            params: data.params,
            confirmationDetails: data.confirmationDetails,
          } : null;

          if (cosAction) {
            setPendingAction(cosAction);
          }

          const coordMessage: Message = {
            id: generateId(),
            role: "assistant",
            content: data.explanation || `I've prepared your executive briefing.`,
            timestamp: new Date(),
            agentName: "Nexia",
            stagedAction: cosAction || undefined,
            actionStatus: cosAction ? 'pending' : undefined,
          };
          setMessages((prev) => [...prev, coordMessage]);
          return;
        }

        // Deep Research Agent is completely synthesized by the orchestrator. Never execute a redundant second call.
        if (data.agent === 'RESEARCH') {
          const coordMessage: Message = {
            id: generateId(),
            role: "assistant",
            content: data.explanation || `Research complete.`,
            timestamp: new Date(),
            agentName: "Nexia",
          };
          setMessages((prev) => [...prev, coordMessage]);
          return;
        }

        // Only present HITL Gate for high-stakes or mutations that require confirmation; read actions execute immediately
        const isReadAction = ['list', 'search', 'get', 'view', 'check', 'summarize', 'stat', 'stats', 'analytics', 'metric', 'metrics', 'estimate', 'inbox', 'read'].some(w => (data.action || '').toLowerCase().includes(w));
        const requiresHITL = !isReadAction && (data.requiresConfirmation === true || (data.action === 'upload' || data.action === 'send' || data.action === 'book' || data.action === 'append_row' || data.action === 'create' || data.action === 'delete'));

        let stagedObj: PendingAction | null = null;
        if (requiresHITL) {
          const actionId = generateId();
          stagedObj = {
            id: actionId,
            agent: data.agent,
            action: data.action,
            params: data.params,
            confirmationDetails: data.confirmationDetails,
          };
          setPendingAction(stagedObj);

          // Also register in persistent tasks store so it appears in the Executive Dashboard Pending Approvals deck
          fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: data.agent,
              action: data.action,
              title: data.confirmationDetails?.title || `${data.agent} Action Pending Sign-Off`,
              details: data.explanation || 'Requires human executive review before dispatch',
              status: 'waiting_approval',
              params: data.params,
            }),
          }).catch(() => {});
        }

        const coordMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: data.explanation || `I've prepared that action for your review.`,
          timestamp: new Date(),
          agentName: "Nexia",
          stagedAction: stagedObj || undefined,
          actionStatus: stagedObj ? 'pending' : undefined,
        };
        setMessages((prev) => [...prev, coordMessage]);

        if (!requiresHITL) {
          await executeAgentTask(data.agent, data.action, data.params, data.traceSteps);
        }
      } else {
        setPendingAction(null);
        const assistantMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: data.response || data.explanation || data.message || "How can I assist you today?",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        setPendingAction(null);
        return;
      }
      setPendingAction(null);
      const errorMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "I ran into a temporary hiccup connecting to the workflow. Once your service or webhook is running, simply reply **'retry'** or **'continue'** and I'll take care of it right away!",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsLoading(false);
    }
  }, [messages, pendingAction, youtubeChannel, executeAgentTask]);

  // ─── Human Confirmed the action ─────────────────────────
  const handleConfirmAction = useCallback(async (action: PendingAction) => {
    setPendingAction(null);
    setMessages((prev) => prev.map((m) => {
      if (m.stagedAction?.id === action.id || (m.stagedAction && m.actionStatus === 'pending')) {
        return { ...m, actionStatus: 'confirmed' };
      }
      return m;
    }));
    await executeAgentTask(action.agent, action.action, { ...action.params, action: action.action });
  }, [executeAgentTask]);

  // ─── Human Cancelled the action ────────────────────────
  const handleCancelAction = useCallback((action: PendingAction) => {
    setPendingAction(null);
    setMessages((prev) => prev.map((m) => {
      if (m.stagedAction?.id === action.id || (m.stagedAction && m.actionStatus === 'pending')) {
        return { ...m, actionStatus: 'cancelled' };
      }
      return m;
    }));
    const cancelMsg: Message = {
      id: generateId(),
      role: "assistant",
      content: `🛡️ **Action Cancelled:** The operation was stopped safely. No external actions were executed.`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, cancelMsg]);
    toast.info("Action cancelled safely.");
  }, []);



  return (
    <AuthGuard>
      <div className="flex h-screen bg-[#f8fafc] dark:bg-[#070a12] text-slate-900 dark:text-zinc-100 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar 
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNewChat={handleNewChat} 
          onSelectSession={handleSelectSession} 
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          onPinSession={handlePinSession}
          onArchiveSession={handleArchiveSession}
          onOpenProfile={() => setIsProfileOpen(true)}
        />

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col min-w-0 h-screen overflow-hidden">
          {/* Header */}
          <Header 
            onOpenProfile={() => setIsProfileOpen(true)}
            onShareChat={handleShareChat}
            isSharing={isSharing}
            onNewChat={handleNewChat}
          />

          {/* Shared Chat Loaded Notice */}
          {sharedChatNotice && (
            <div className="bg-indigo-50/90 dark:bg-indigo-950/40 border-b border-indigo-200/60 dark:border-indigo-800/40 px-4 py-2 flex items-center justify-between text-xs font-mono text-indigo-900 dark:text-indigo-200 shrink-0">
              <div className="flex items-center space-x-2">
                <Globe size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Viewing shared conversation: <strong>{sharedChatNotice}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSharedChatNotice(null);
                  window.history.replaceState({}, '', '/chat');
                }}
                className="text-xs hover:underline text-indigo-600 dark:text-indigo-400 cursor-pointer ml-4 font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Chat Window — fills available space and scrolls smoothly with min-h-0 */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            <ChatWindow
              messages={messages}
              isLoading={isLoading}
              agentTasks={agentTasks}
              traceSteps={traceSteps}
              pendingAction={pendingAction}
              onSendMessage={handleSendMessage}
              onConfirmAction={handleConfirmAction}
              onCancelAction={handleCancelAction}
              onUpdateParams={handleUpdateParams}
              onStop={handleStopGeneration}
              pastSessionCount={sessions.length}
            />
          </div>

          {/* Chat Input — fixed at bottom */}
          <div className="border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#070a12]/95 backdrop-blur-md p-3 md:p-4 shrink-0">
            <ChatInput onSend={handleSendMessage} isLoading={isLoading} onStop={handleStopGeneration} />
          </div>
        </div>

        {/* Profile & System Settings Modal */}
        <ProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          onClearChat={handleClearAllHistory}
          onLogout={handleLogout}
          youtubeChannel={youtubeChannel}
          onUpdateChannel={handleUpdateChannel}
        />

        {/* Share Conversation Modal */}
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          title={
            sessions.find(s => s.id === activeSessionId)?.title ||
            messages.find(m => m.role === 'user')?.content.slice(0, 45) ||
            'Executive Conversation'
          }
          shareUrl={shareUrl}
          messageCount={messages.length}
        />
      </div>
    </AuthGuard>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen bg-[#070A12] flex items-center justify-center text-zinc-400 font-mono text-xs">
          Loading Nexia Chat...
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
