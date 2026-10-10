import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// TypeScript Interfaces for DB
export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  agent_name?: string;
  created_at: string;
}

export interface AgentLog {
  id: string;
  conversation_id: string;
  agent_id: string;
  action: string;
  status: 'success' | 'error' | 'pending';
  result?: any;
  created_at: string;
}

// Helper Functions
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'model' | 'system',
  content: string,
  agentName?: string
) {
  const { data, error } = await supabase
    .from('messages')
    .insert([
      { conversation_id: conversationId, role, content, agent_name: agentName }
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getConversations(userId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getMessages(conversationId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function logAgentActivity(
  conversationId: string,
  agentId: string,
  action: string,
  status: 'success' | 'error' | 'pending',
  result?: any
) {
  const { data, error } = await supabase
    .from('agent_logs')
    .insert([
      { conversation_id: conversationId, agent_id: agentId, action, status, result }
    ])
    .select()
    .single();

  if (error) console.error('Failed to log agent activity:', error);
  return data;
}
