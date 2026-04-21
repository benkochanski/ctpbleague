#!/usr/bin/env python3
# Generate remaining schedule rows as TSV

# Column order matches input
COLS = ["game_id","match_id","round_id","round_number","round_type","game_number_in_round","game_sequence","court_number","game_type","home_team_id","away_team_id","home_player_1_id","home_player_2_id","away_player_1_id","away_player_2_id","home_score","away_score","winner_team_id","status","lineup_submitted_home","lineup_submitted_away","score_entered_by_user_id","score_entered_at","updated_at","home_updated_by","away_updated_by","home_submitted_by","away_submitted_by","home_updated_at","away_updated_at","home_submitted_at","away_submitted_at","home_updated_by_email","away_updated_by_email","home_submitted_by_email","away_submitted_by_email","updated_by","updated_by_user_id"]

# Game type per (div, round, game_number_in_round)
def game_type(div, rnd, g):
    if div == 1:
        if rnd == 9:  # super
            return ["mixed","coed","coed"][g-1]
        # R01,R03,R05,R07 odd: womens + 3 coed; R02,R04,R06,R08 even: mixed + 3 coed
        if rnd % 2 == 1:
            return "womens" if g == 1 else "coed"
        else:
            return "mixed" if g == 1 else "coed"
    else:
        if rnd == 9:
            return ["womens","mens","mixed"][g-1]
        if rnd % 2 == 1:
            return ["womens","womens","mens","mens"][g-1]
        else:
            return "mixed"

def home_team(week, div):
    # Home = CAMP when (W+D) even, else DILL
    if (week + div) % 2 == 0:
        return f"TEAM1_CAMP_DIV{div}", f"TEAM2_DILL_DIV{div}"
    else:
        return f"TEAM2_DILL_DIV{div}", f"TEAM1_CAMP_DIV{div}"

def make_row(week, div, rnd, g, seq):
    match_id = f"MATCH_W{week}_DIV{div}"
    round_id = f"ROUND_MATCHW{week}DIV{div}_R{rnd:02d}"
    game_id = f"GAME_MATCHW{week}DIV{div}_R{rnd:02d}_G{g:02d}"
    round_type = "super_dreambreaker" if rnd == 9 else "regulation"
    gt = game_type(div, rnd, g)
    home, away = home_team(week, div)
    row = {c: "" for c in COLS}
    row["game_id"] = game_id
    row["match_id"] = match_id
    row["round_id"] = round_id
    row["round_number"] = str(rnd)
    row["round_type"] = round_type
    row["game_number_in_round"] = str(g)
    row["game_sequence"] = str(seq)
    row["game_type"] = gt
    row["home_team_id"] = home
    row["away_team_id"] = away
    row["status"] = "scheduled"
    row["lineup_submitted_home"] = "FALSE"
    row["lineup_submitted_away"] = "FALSE"
    return [row[c] for c in COLS]

def matchup_rows(week, div, start_round=1, start_g=1):
    """Return all rows for week/div starting at (round, game_in_round)."""
    rows = []
    seq = 0
    for rnd in range(1, 10):
        ngames = 3 if rnd == 9 else 4
        for g in range(1, ngames + 1):
            seq += 1
            if rnd < start_round or (rnd == start_round and g < start_g):
                continue
            rows.append(make_row(week, div, rnd, g, seq))
    return rows

out = []
# Complete W5DIV4: from R07_G03 onward
out.extend(matchup_rows(5, 4, start_round=7, start_g=3))
# W5DIV5 entirely
out.extend(matchup_rows(5, 5))
# W6 and W7, all divs
for week in (6, 7):
    for div in (1, 2, 3, 4, 5):
        out.extend(matchup_rows(week, div))

with open("/Users/BenKochanski/CPBL/schedule_new_rows.tsv", "w") as f:
    f.write("\t".join(COLS) + "\n")
    for r in out:
        f.write("\t".join(r) + "\n")

print(f"Wrote {len(out)} rows")
