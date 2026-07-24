import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { normalizeLanguage } from './formatLocale.js';

import commonVi from './locales/vi/common.json';
import authVi from './locales/vi/auth.json';
import vnStocksVi from './locales/vi/vnStocks.json';
import derivativesVi from './locales/vi/derivatives.json';
import cryptoVi from './locales/vi/crypto.json';
import internationalVi from './locales/vi/international.json';
import paperVi from './locales/vi/paper.json';
import autoDuckVi from './locales/vi/autoDuck.json';
import brokerVi from './locales/vi/broker.json';
import chartVi from './locales/vi/chart.json';
import marketVi from './locales/vi/market.json';

import commonEn from './locales/en/common.json';
import authEn from './locales/en/auth.json';
import vnStocksEn from './locales/en/vnStocks.json';
import derivativesEn from './locales/en/derivatives.json';
import cryptoEn from './locales/en/crypto.json';
import internationalEn from './locales/en/international.json';
import paperEn from './locales/en/paper.json';
import autoDuckEn from './locales/en/autoDuck.json';
import brokerEn from './locales/en/broker.json';
import chartEn from './locales/en/chart.json';
import marketEn from './locales/en/market.json';

const saved = typeof localStorage !== 'undefined'
  ? normalizeLanguage(localStorage.getItem('omni_lang'))
  : 'vi';

void i18n.use(initReactI18next).init({
  resources: {
    vi: {
      common: commonVi,
      auth: authVi,
      vnStocks: vnStocksVi,
      derivatives: derivativesVi,
      crypto: cryptoVi,
      international: internationalVi,
      paper: paperVi,
      autoDuck: autoDuckVi,
      broker: brokerVi,
      chart: chartVi,
      market: marketVi,
    },
    en: {
      common: commonEn,
      auth: authEn,
      vnStocks: vnStocksEn,
      derivatives: derivativesEn,
      crypto: cryptoEn,
      international: internationalEn,
      paper: paperEn,
      autoDuck: autoDuckEn,
      broker: brokerEn,
      chart: chartEn,
      market: marketEn,
    },
  },
  lng: saved,
  fallbackLng: 'vi',
  supportedLngs: ['vi', 'en'],
  defaultNS: 'common',
  ns: ['common', 'auth', 'vnStocks', 'derivatives', 'crypto', 'international', 'paper', 'autoDuck', 'broker', 'chart', 'market'],
  interpolation: { escapeValue: false },
  returnNull: false,
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = saved;
}

export default i18n;
