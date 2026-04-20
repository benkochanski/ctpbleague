const BRANDING_SHEET = 'Branding';

function getBranding_() {
  const ss = getBackendSpreadsheet_();
  const sh = getOrCreateBrandingSheet_(ss, BRANDING_SHEET);

  const values = sh.getDataRange().getValues();
  const map = {};
  if (values.length > 1) {
    values.slice(1).forEach(row => {
      const key = String(row[0] || '').trim();
      const val = String(row[1] || '').trim();
      if (key) map[key] = val;
    });
  }

  return {
    leagueLogoUrl: map.leagueLogoFileId ? driveImageUrl_(map.leagueLogoFileId) : '',
    campLogoUrl:   map.campLogoFileId   ? driveImageUrl_(map.campLogoFileId)   : '',
    dillLogoUrl:   map.dillLogoFileId   ? driveImageUrl_(map.dillLogoFileId)   : '',
    clubLogos:     getClubLogos_(ss)
  };
}

/**
 * Reads the Clubs sheet and returns a map of { lowercased_short_name: imageUrl }.
 * Supports a logo_file_id column (Drive file ID → thumbnail URL) or a logo_url
 * column (raw file ID or full https URL both accepted).
 */
function getClubLogos_(ss) {
  const logos = {};
  try {
    const sh = ss.getSheetByName('Clubs');
    if (!sh) return logos;
    const values = sh.getDataRange().getValues();
    if (values.length < 2) return logos;

    const headers = values[0].map(h => String(h || '').trim().toLowerCase());

    // Accept any of these column names for the club key and logo value
    const findCol = (...names) => { for (const n of names) { const i = headers.indexOf(n); if (i >= 0) return i; } return -1; };
    const shortNameCol = findCol('short_name', 'shortname', 'short', 'club_short', 'key');
    const logoFileCol  = findCol('logo_file_id', 'logo_fileid', 'file_id', 'fileid', 'image_file_id');
    const logoUrlCol   = findCol('logo_url', 'logo', 'image_url', 'image', 'url', 'logo_id');

    if (shortNameCol < 0) return logos;

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const key = String(row[shortNameCol] || '').trim().toLowerCase();
      if (!key) continue;

      let url = '';
      if (logoFileCol >= 0 && row[logoFileCol]) {
        url = driveImageUrl_(String(row[logoFileCol]).trim());
      } else if (logoUrlCol >= 0 && row[logoUrlCol]) {
        const raw = String(row[logoUrlCol]).trim();
        // Raw value is either a full https URL or a bare Drive file ID
        url = raw.startsWith('http') ? raw : (raw ? driveImageUrl_(raw) : '');
      }

      if (url) logos[key] = url;
    }
  } catch (e) {
    console.error('getClubLogos_ error:', e);
  }
  return logos;
}

function driveImageUrl_(fileId) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200`;
}

function getOrCreateBrandingSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 4, 2).setValues([
      ['key', 'value'],
      ['leagueLogoFileId', ''],
      ['campLogoFileId', ''],
      ['dillLogoFileId', '']
    ]);
  }
  return sh;
}
