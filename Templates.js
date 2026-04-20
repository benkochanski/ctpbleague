function getMatchTemplateRows_(divisionId) {
  const divisions = getObjects_(SHEETS.DIVISIONS);
  const templates = getObjects_(SHEETS.MATCH_FORMAT_TEMPLATES);

  const division = divisions.find(d => d.division_id === divisionId);
  if (!division) throw new Error(`Division not found: ${divisionId}`);

  return templates
    .filter(t => t.match_template_id === division.match_template_id)
    .sort((a, b) => {
      return Number(a.round_number) - Number(b.round_number) ||
             Number(a.game_number_in_round) - Number(b.game_number_in_round);
    });
}