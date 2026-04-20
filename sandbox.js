function testBackendOpen() {
  const ss = SpreadsheetApp.openById('1DRiZ-xraXY9J1Bp09U3Rxg0qx943Apj8guBy1fd5jJ8');
  Logger.log(ss.getName());
}

function testMatchesLoad() {
  const data = getOpenMatchesForScoreEntry();
  Logger.log(JSON.stringify(data, null, 2));
}