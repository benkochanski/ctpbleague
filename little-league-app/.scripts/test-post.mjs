const testChart = {
  coachId: "__post_test__",
  coachName: "Test Coach",
  hitters: { "++": [], "+": [], "-": [] },
  pitchers: [],
  catchers: [],
  defense: { "1B": [], "2B": [], "SS": [], "3B": [] },
  notes: { hitters: "", pitching: "", defense: "" },
  updatedAt: Date.now(),
};

const res = await fetch(
  "https://little-league-app.pages.dev/api/depthchart/__post_test__",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testChart),
  }
);
const text = await res.text();
console.log("STATUS", res.status);
console.log("BODY", text);
