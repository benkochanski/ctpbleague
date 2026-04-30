function upsertMatchSubmission_(matchId, teamId, status, access) {
  const all = getObjects_(SHEETS.MATCH_SUBMISSIONS);
  const userId    = String((access && access.userId) || '');
  const userEmail = String((access && access.email)  || '');

  let found = false;
  const updated = all.map(s => {
    if (s.match_id === matchId && s.team_id === teamId && s.submission_type === 'lineup') {
      found = true;
      s.submitted_by_user_id = userId;
      s.submitted_by_email = userEmail;
      s.submitted_at = nowStamp_();
      s.submission_status = status;
      s.is_visible_to_opponent = status === SUBMISSION_STATUS.SUBMITTED;
      s.is_visible_to_public = false;
      s.officially_submitted = status === SUBMISSION_STATUS.SUBMITTED;
    }
    return s;
  });

  if (!found) {
    updated.push({
      submission_id: makeId_('SUB'),
      match_id: matchId,
      team_id: teamId,
      submitted_by_user_id: userId,
      submitted_by_email: userEmail,
      submitted_at: nowStamp_(),
      submission_type: 'lineup',
      submission_status: status,
      is_visible_to_opponent: status === SUBMISSION_STATUS.SUBMITTED,
      is_visible_to_public: false,
      officially_submitted: status === SUBMISSION_STATUS.SUBMITTED,
      notes: ''
    });
  }

  overwriteObjects_(SHEETS.MATCH_SUBMISSIONS, updated);
}