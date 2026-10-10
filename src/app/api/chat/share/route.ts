import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { executeMongoOperation } from '@/lib/mongodb';

const SHARED_CHATS_FILE = path.join(process.cwd(), '.shared-chats.json');

function getLocalSharedChats(): Record<string, any> {
  try {
    if (fs.existsSync(SHARED_CHATS_FILE)) {
      const data = fs.readFileSync(SHARED_CHATS_FILE, 'utf-8');
      if (data && data.trim()) {
        return JSON.parse(data);
      }
    }
  } catch (err: any) {
    console.warn('[Share API] Read local cache notice:', err?.message);
  }
  return {};
}

function saveLocalSharedChat(shareId: string, payload: any) {
  try {
    const existing = getLocalSharedChats();
    existing[shareId] = payload;
    fs.writeFileSync(SHARED_CHATS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('[Share API] Write local cache notice:', err?.message);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, messages, sessionId } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot share an empty conversation.' },
        { status: 400 }
      );
    }

    const shareId = `c_${Math.random().toString(36).substring(2, 8)}${Date.now().toString(36)}`;
    const conversationData = {
      shareId,
      sessionId: sessionId || null,
      title: title || 'Executive Session',
      messages,
      createdAt: new Date().toISOString(),
    };

    // 1. Save to local disk cache fallback
    saveLocalSharedChat(shareId, conversationData);

    // 2. Persist to MongoDB Atlas if available
    try {
      await executeMongoOperation(async (db: any) => {
        await db.collection('shared_conversations').insertOne(conversationData);
      });
    } catch (dbErr: any) {
      console.warn('[Share API] MongoDB save notice:', dbErr?.message);
    }

    return NextResponse.json({
      success: true,
      shareId,
      title: conversationData.title,
      createdAt: conversationData.createdAt,
    });
  } catch (error: any) {
    console.error('[Share API POST Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create share link.' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing share id' },
        { status: 400 }
      );
    }

    // 1. Check local cache first
    const localChats = getLocalSharedChats();
    if (localChats[id]) {
      return NextResponse.json({
        success: true,
        conversation: localChats[id],
      });
    }

    // 2. Query MongoDB
    let foundInDb: any = null;
    try {
      foundInDb = await executeMongoOperation(async (db: any) => {
        return await db.collection('shared_conversations').findOne({ shareId: id });
      });
    } catch (dbErr: any) {
      console.warn('[Share API] MongoDB query notice:', dbErr?.message);
    }

    if (foundInDb) {
      // Backfill local cache
      saveLocalSharedChat(id, foundInDb);
      return NextResponse.json({
        success: true,
        conversation: foundInDb,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Shared conversation not found' },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('[Share API GET Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve shared conversation.' },
      { status: 500 }
    );
  }
}
