'use strict';
/** ММ — документ «О системе» (system.json ММ: docs/SYSTEM.md, версия, дата). Только чтение. */
const { serve } = require('./_mm.js');
module.exports = serve('system.json', v => {
  if (!v || v.schema !== 'mayak-system/1' || typeof v.markdown !== 'string') throw Error('неизвестная схема документа ММ');
  return v;
});
