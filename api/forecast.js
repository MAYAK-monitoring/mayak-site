'use strict';
/** ММ — прогноз на 12 месяцев по портфелям (forecast.json ММ). Только чтение. */
const { serve } = require('./_mm.js');
module.exports = serve('forecast.json', v => {
  if (!v || v.schema !== 'mayak-forecast/1') throw Error('неизвестная схема прогноза ММ');
  return v;
});
