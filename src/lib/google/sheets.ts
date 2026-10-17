import { google } from 'googleapis';
import { getSheetsAuthClient, getAuthenticatedClient } from './auth';
import { executeMongoOperation } from '../mongodb';

export interface ExpenseRow {
  date: string;
  merchant: string;
  category: string;
  amount: number;
  description?: string;
}

let memorySpreadsheetId: string | null = null;

/**
 * Extracts a spreadsheet ID from a URL or raw ID string.
 */
export function extractSpreadsheetId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Match standard Google Sheets URL format: /spreadsheets/d/([a-zA-Z0-9-_]+)
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  // If it's a raw spreadsheet ID string (typically 20+ chars alphanumeric with _ or -)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Sets and persists the primary Google Spreadsheet ID for Nexia Expenses.
 */
export async function setExpenseSpreadsheetId(idOrUrl: string): Promise<string | null> {
  const sheetId = extractSpreadsheetId(idOrUrl);
  if (!sheetId) return null;

  memorySpreadsheetId = sheetId;

  // Persist to MongoDB Atlas settings collection
  try {
    await executeMongoOperation(async (db: any) => {
      await db.collection('settings').updateOne(
        { id: 'primary_expense_spreadsheet_id' },
        {
          $set: {
            id: 'primary_expense_spreadsheet_id',
            spreadsheetId: sheetId,
            updatedAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    });
  } catch (e: any) {
    console.warn('[Sheets API] Save spreadsheet ID notice:', e?.message);
  }

  return sheetId;
}

/**
 * Gets the primary Google Spreadsheet ID for Nexia Expenses.
 * Checks in-memory cache, GOOGLE_EXPENSE_SPREADSHEET_ID env, MongoDB Atlas, and Drive discovery.
 */
export async function getOrCreateExpenseSheetId(): Promise<string | null> {
  // 1. In-memory cached ID
  if (memorySpreadsheetId) return memorySpreadsheetId;

  // 2. Direct environment variable
  const envId = process.env.GOOGLE_EXPENSE_SPREADSHEET_ID;
  if (envId && envId.trim()) {
    const extracted = extractSpreadsheetId(envId);
    if (extracted) {
      memorySpreadsheetId = extracted;
      return extracted;
    }
  }

  // 3. MongoDB Atlas settings collection
  try {
    const record = await executeMongoOperation(async (db: any) => {
      return db.collection('settings').findOne({ id: 'primary_expense_spreadsheet_id' });
    });
    if (record?.spreadsheetId) {
      memorySpreadsheetId = record.spreadsheetId;
      return record.spreadsheetId;
    }
  } catch (err: any) {
    console.warn('[Sheets API] MongoDB fetch sheet ID notice:', err?.message);
  }

  // 4. Drive API discovery fallback (if Drive API is enabled in Google Cloud)
  const auth = await getSheetsAuthClient();
  if (!auth) return null;

  try {
    const drive = google.drive({ version: 'v3', auth });
    const searchRes = await drive.files.list({
      q: "(name contains 'OmniAgent' or name contains 'Expense' or name contains 'Ledger' or name = 'OmniAgent_Expenses') and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc',
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
      const exactMatch = searchRes.data.files.find(f => f.name?.toLowerCase().includes('omniagent'));
      const foundId = exactMatch?.id || searchRes.data.files[0].id || null;
      if (foundId) {
        memorySpreadsheetId = foundId;
        return foundId;
      }
    }
  } catch (err: any) {
    // Expected notice when Google Drive API is not enabled in Google Cloud project
    console.warn('[Sheets API] Drive file search notice (expected if Drive API not enabled):', err?.message);
  }

  return null;
}

/**
 * Reads real expenses from the Google Spreadsheet
 */
export async function getSpreadsheetExpenses(customSpreadsheetId?: string): Promise<{
  expenses: ExpenseRow[];
  total: number;
  spreadsheetId: string | null;
}> {
  const auth = await getSheetsAuthClient();
  if (!auth) {
    return { expenses: [], total: 0, spreadsheetId: null };
  }

  const spreadsheetId = customSpreadsheetId || await getOrCreateExpenseSheetId();
  if (!spreadsheetId) {
    return { expenses: [], total: 0, spreadsheetId: null };
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    // Dynamically retrieve the first sheet / tab name
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets(properties(title))',
    });
    const sheetTitle = meta.data.sheets?.[0]?.properties?.title || 'Sheet1';

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetTitle}!A2:E200`,
    });

    const rows = res.data.values || [];
    const expenses: ExpenseRow[] = [];
    let total = 0;

    for (const r of rows) {
      if (!r[0] && !r[1] && !r[3]) continue;
      const amount = Number(String(r[3] || '').replace(/[^0-9.-]+/g, '')) || 0;
      total += amount;
      expenses.push({
        date: String(r[0] || '').trim(),
        merchant: String(r[1] || 'Direct Spend').trim(),
        category: String(r[2] || 'General').trim(),
        amount,
        description: r[4] ? String(r[4]).trim() : undefined,
      });
    }

    return { expenses, total, spreadsheetId };
  } catch (err: any) {
    console.warn('[Sheets API] Read expenses notice:', err?.message);
    return { expenses: [], total: 0, spreadsheetId };
  }
}

/**
 * Appends a real expense row directly to the Google Spreadsheet
 */
export async function appendSpreadsheetExpense(
  expense: ExpenseRow,
  customSpreadsheetId?: string
): Promise<{ success: boolean; spreadsheetId?: string; sheetTitle?: string }> {
  const auth = await getSheetsAuthClient();
  if (!auth) {
    throw new Error('Google Workspace is not authenticated. Please connect your Google account.');
  }

  const spreadsheetId = customSpreadsheetId || await getOrCreateExpenseSheetId();
  if (!spreadsheetId) {
    throw new Error('NO_SPREADSHEET_LINKED: No Google Spreadsheet is linked yet. Please provide the Google Sheet URL or ID.');
  }

  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(title))',
  });
  const sheetTitle = meta.data.sheets?.[0]?.properties?.title || 'Sheet1';

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetTitle}!A:E`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [
        [
          expense.date,
          expense.merchant,
          expense.category,
          expense.amount,
          expense.description || '',
        ],
      ],
    },
  });

  return { success: true, spreadsheetId, sheetTitle };
}

/**
 * Retroactively syncs any pending expenses recorded in MongoDB to the connected Google Spreadsheet.
 */
export async function syncPendingExpensesToSpreadsheet(targetSpreadsheetId?: string): Promise<{
  syncedCount: number;
  syncedExpenses: any[];
  errors: any[];
}> {
  const spreadsheetId = targetSpreadsheetId || await getOrCreateExpenseSheetId();
  if (!spreadsheetId) {
    return { syncedCount: 0, syncedExpenses: [], errors: ['No spreadsheet ID available'] };
  }

  let syncedCount = 0;
  const syncedExpenses: any[] = [];
  const errors: any[] = [];

  const pending = await executeMongoOperation(async (db: any) => {
    return db.collection('expenses')
      .find({ syncedToSheets: { $ne: true } })
      .sort({ createdAt: 1 })
      .toArray();
  });

  if (!pending || pending.length === 0) {
    return { syncedCount: 0, syncedExpenses: [], errors: [] };
  }

  for (const exp of pending) {
    try {
      await appendSpreadsheetExpense({
        date: exp.date || new Date().toISOString().split('T')[0],
        merchant: exp.merchant || 'Direct Entry',
        category: exp.category || 'General',
        amount: Number(exp.amount) || 0,
        description: exp.description || 'Omni-Agent Sync',
      }, spreadsheetId);

      // Mark as synced in MongoDB
      await executeMongoOperation(async (db: any) => {
        await db.collection('expenses').updateOne(
          { _id: exp._id },
          {
            $set: {
              syncedToSheets: true,
              syncedSpreadsheetId: spreadsheetId,
              syncedAt: new Date().toISOString(),
            },
          }
        );
      });

      syncedCount++;
      syncedExpenses.push({
        id: exp._id,
        amount: exp.amount,
        merchant: exp.merchant,
        category: exp.category,
        date: exp.date,
      });
    } catch (err: any) {
      errors.push({ id: exp._id, error: err?.message });
    }
  }

  return { syncedCount, syncedExpenses, errors };
}
