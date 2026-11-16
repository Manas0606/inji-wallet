import i18next from 'i18next';
import {initReactI18next} from 'react-i18next';

import fr from './locales/fr.json';

import {iso6393To1} from 'iso-639-3';
import {LocalizedField} from './machines/VerifiableCredential/VCMetaMachine/vc';

// Haiti wallet uses French exclusively.
const resources = {fr};
const languageCodeMap = {} as {[key: string]: string};

export const SUPPORTED_LANGUAGES = {
  fr: 'Français',
};

i18next.use(initReactI18next).init({
  compatibilityJSON: 'v3',
  resources,
  lng: 'fr',
  fallbackLng: 'fr',
  supportedLngs: ['fr'],
}).then(() => {
  populateLanguageCodeMap();
});

export default i18next;

export function getLanguageCode(code: string) {
  return 'fr';
}

export function getValueForCurrentLanguage(
  localizedData: LocalizedField[] | Object,
  defaultLanguage = '@none',
) {
  const currentLanguageCode = languageCodeMap.fr || 'fra';
  if (Array.isArray(localizedData)) {
    const valueForCurrentLanguage = localizedData.filter(
      obj => obj.language === currentLanguageCode || obj.language === 'fr',
    );
    return valueForCurrentLanguage[0]?.value
      ? valueForCurrentLanguage[0].value
      : localizedData[0]?.value;
  } else {
    return (localizedData as any)?.value;
  }
}

export function getClientNameForCurrentLanguage(
  localizedData: Object,
  defaultLanguage = '@none',
) {
  const localizedDataObject = localizedData as {[key: string]: string};
  return localizedDataObject['fra'] ||
    localizedDataObject['fr'] ||
    localizedDataObject[defaultLanguage];
}

function getThreeLetterLanguageCode(twoLetterLanguageCode: string) {
  return iso6393To1
    ? Object.keys(iso6393To1).find(
        key => iso6393To1[key] === twoLetterLanguageCode,
      )
    : null;
}

function populateLanguageCodeMap() {
  languageCodeMap.fr = getThreeLetterLanguageCode('fr') || 'fra';
}

export function getLocalizedField(
  rawField: string | LocalizedField[] | Object,
) {
  if (typeof rawField === 'string') {
    return rawField;
  }
  if (Array.isArray(rawField)) {
    try {
      if (rawField.length === 1) return rawField[0]?.value;
      return getValueForCurrentLanguage(rawField);
    } catch (e) {
      return '';
    }
  }
  try {
    if (Object.keys(rawField).length === 1) return Object.values(rawField)[0];
    return getValueForCurrentLanguage(rawField);
  } catch (e) {
    return '';
  }
}

function isTwoLetterLanguageCode(languageCode: string) {
  return languageCode.length === 2;
}
