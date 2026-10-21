'use strict';
/** ММ — журнал операций позиций (journal.json ММ): открытия, пополнения, выводы, сборы, Claim, закрытия. Только чтение. */
const { serve } = require('./_mm.js');
module.exports = serve('journal.json', v => {
  if (!v || v.schema !== 'mayak-journal/1') throw Error('неизвестная схема журнала ММ');
  return v;
});
