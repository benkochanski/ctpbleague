// ============================================================================
// Requests.js — bug reports & enhancement requests
//
// Backed by the `Requests` tab in the league spreadsheet. The tab is created
// on first use if missing.
//
// Public:
//   submitRequestV1(payload)       — append a new request (no auth)
//
// Admin (passcode-gated, server-side):
//   listRequestsV1(passcode)       — return all requests
//   updateRequestV1(passcode, id, updates)
//                                  — patch status / admin_notes
//
// Admin passcode is read from script property ADMIN_REQUEST_PASSCODE.
// Falls back to the same hub passcode (`cpbl2026`) so we don't need a separate
// secret in dev. Set the property in the GAS UI for production.
// ============================================================================

const REQUESTS_SHEET_NAME = 'Requests';

const REQUESTS_HEADERS = [
  'request_id',
  'type',
  'title',
  'description',
  'reporter_name',
  'reporter_email',
  'page_context',
  'status',
  'admin_notes',
  'created_at',
  'updated_at'
];

const REQUEST_STATUSES = ['new', 'in_progress', 'done', 'wontfix'];
const REQUEST_TYPES = ['bug', 'enhancement'];

function ensureRequestsSheet_() {
  const ss = getBackendSpreadsheet_();
  let sh = ss.getSheetByName(REQUESTS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(REQUESTS_SHEET_NAME);
    sh.getRange(1, 1, 1, REQUESTS_HEADERS.length).setValues([REQUESTS_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, REQUESTS_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function getRequestsAdminPasscode_() {
  const prop = PropertiesService.getScriptProperties().getProperty('ADMIN_REQUEST_PASSCODE');
  return (prop && String(prop).trim()) || 'cpbl2026';
}

function requireRequestsAdmin_(passcode) {
  const expected = getRequestsAdminPasscode_();
  if (String(passcode || '').trim() !== expected) {
    throw new Error('Unauthorized');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * payload: { type, title, description, reporter_name, reporter_email, page_context }
 */
function submitRequestV1(payload) {
  ensureRequestsSheet_();
  const p = payload || {};

  const type = REQUEST_TYPES.includes(String(p.type || '').toLowerCase())
    ? String(p.type).toLowerCase()
    : 'bug';
  const title = String(p.title || '').trim();
  const description = String(p.description || '').trim();

  if (!title) throw new Error('Title is required');
  if (!description) throw new Error('Description is required');
  if (title.length > 200) throw new Error('Title is too long (max 200 chars)');
  if (description.length > 5000) throw new Error('Description is too long (max 5000 chars)');

  const row = {
    request_id:     makeId_('REQ'),
    type:           type,
    title:          title,
    description:    description,
    reporter_name:  String(p.reporter_name || '').trim(),
    reporter_email: String(p.reporter_email || '').trim(),
    page_context:   String(p.page_context || '').trim(),
    status:         'new',
    admin_notes:    '',
    created_at:     nowStamp_(),
    updated_at:     nowStamp_()
  };

  appendObjects_(REQUESTS_SHEET_NAME, [row]);
  return { ok: true, request_id: row.request_id };
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

function listRequestsV1(passcode) {
  requireRequestsAdmin_(passcode);
  ensureRequestsSheet_();
  const rows = getObjects_(REQUESTS_SHEET_NAME)
    .map(r => ({
      request_id:     String(r.request_id || ''),
      type:           String(r.type || ''),
      title:          String(r.title || ''),
      description:    String(r.description || ''),
      reporter_name:  String(r.reporter_name || ''),
      reporter_email: String(r.reporter_email || ''),
      page_context:   String(r.page_context || ''),
      status:         String(r.status || 'new'),
      admin_notes:    String(r.admin_notes || ''),
      created_at:     String(r.created_at || ''),
      updated_at:     String(r.updated_at || '')
    }))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { ok: true, requests: rows };
}

/**
 * updates: { status?, admin_notes? }
 */
function updateRequestV1(passcode, requestId, updates) {
  requireRequestsAdmin_(passcode);
  ensureRequestsSheet_();

  const cleanId = String(requestId || '').trim();
  if (!cleanId) throw new Error('Missing requestId');

  const u = updates || {};
  const all = getObjects_(REQUESTS_SHEET_NAME);
  const idx = all.findIndex(r => String(r.request_id || '').trim() === cleanId);
  if (idx === -1) throw new Error('Request not found: ' + cleanId);

  if (Object.prototype.hasOwnProperty.call(u, 'status')) {
    const next = String(u.status || '').toLowerCase();
    if (!REQUEST_STATUSES.includes(next)) throw new Error('Invalid status: ' + next);
    all[idx].status = next;
  }
  if (Object.prototype.hasOwnProperty.call(u, 'admin_notes')) {
    all[idx].admin_notes = String(u.admin_notes || '');
  }
  all[idx].updated_at = nowStamp_();

  overwriteObjects_(REQUESTS_SHEET_NAME, all);
  return { ok: true, request: all[idx] };
}
