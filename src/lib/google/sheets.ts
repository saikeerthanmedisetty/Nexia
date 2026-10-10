import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth';

export interface ExpenseRow {
  date: string;
  merchant: string;
  category: string;
  amount: number;
  description?: string;
}

/**
 * Gets or creates the default Google Spreadsheet ID for Nexia Expenses
 */
export async function getOrCreateExpenseSheetId(): Promise<string | null> {
  const envId = process.env.GOOGLE_EXPENSE_SPREADSHEET_ID;
  if (envId && envId.trim()) return envId.trim();

  const auth = await getAuthenticatedClient();
  if (!auth) return null;

  try {
    const drive = google.drive({ version: 'v3', auth });
    // Look for existing OmniAgent_Expenses or Expense Ledger
    const searchRes = await drive.files.list({
      q: "(name contains 'OmniAgent' or name contains 'Expense' or name contains 'Ledger' or name = 'OmniAgent_Expenses') and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc',
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
      // Prioritize OmniAgent_Expenses if present
      const exactMatch = searchRes.data.files.find(f => f.name?.toLowerCase().includes('omniagent'));
      if (exactMatch && exactMatch.id) return exactMatch.id;
      return searchRes.data.files[0].id || null;
    }

    // Fallback: search any spreadsheet in the user's Drive
    const anyRes = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc',
    });

    if (anyRes.data.files && anyRes.data.files.length > 0) {
      return anyRes.data.files[0].id || null;
    }

    // Create a new sheet only if none exists
    const sheets = google.sheets({ version: 'v4', auth });
    const createRes = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: 'OmniAgent_Expenses',
        },
        sheets: [
          {
            properties: { title: 'Sheet1' },
            data: [
              {
                startRow: 0,
                startColumn: 0,
                rowData: [
                  {
                    values: [
                      { userEnteredValue: { stringValue: 'Date' } },
                      { userEnteredValue: { stringValue: 'Merchant' } },
                      { userEnteredValue: { stringValue: 'Category' } },
                      { userEnteredValue: { stringValue: 'Amount' } },
                      { userEnteredValue: { stringValue: 'Description' } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    return createRes.data.spreadsheetId || null;
  } catch (err: any) {
    console.warn('[Sheets API] Get or create sheet notice:', err?.message);
    return null;
  }
}

/**
 * Reads real expenses from the Google Spreadsheet
 */
export async function getSpreadsheetExpenses(customSpreadsheetId?: string): Promise<{
  expenses: ExpenseRow[];
  total: number;
  spreadsheetId: string | null;
}> {
  const auth = await getAuthenticatedClient();
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
): Promise<{ success: boolean; spreadsheetId?: string }> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google Workspace is not authenticated. Please connect your Google account.');
  }

  const spreadsheetId = customSpreadsheetId || await getOrCreateExpenseSheetId();
  if (!spreadsheetId) {
    throw new Error('No Google Spreadsheet found or created.');
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

  return { success: true, spreadsheetId };
}
