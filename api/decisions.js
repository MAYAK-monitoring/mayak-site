'use strict';
/** ММ — карта решения (decisions.json ММ): вердикт и варианты для позиций вне диапазона и у границы. Только чтение. */
const { serve } = require('./_mm.js');
module.exports = serve('decisions.json', v => {
  if (!v || v.schema !== 'mayak-decisions/1') throw Error('неизвестная схема решений ММ');
  return v;
});
